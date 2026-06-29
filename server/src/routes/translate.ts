import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { ASRClient, TTSClient, LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '../storage/database/supabase-client.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * POST /api/v1/translate/asr
 * Upload audio file and perform speech recognition
 * Body: FormData with 'file' (audio file)
 * Returns: { text: string }
 */
router.post('/asr', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传音频文件' });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const asrClient = new ASRClient(config, customHeaders);

    const audioBase64 = req.file.buffer.toString('base64');
    const result = await asrClient.recognize({
      uid: 'translator-user',
      base64Data: audioBase64,
    });

    if (!result.text || result.text.trim() === '') {
      return res.status(422).json({ error: '未能识别到语音内容，请重新录音' });
    }

    res.json({ text: result.text });
  } catch (error) {
    console.error('ASR error:', error);
    res.status(500).json({ error: '语音识别失败，请重试' });
  }
});

/**
 * POST /api/v1/translate
 * Translate text between Chinese and Khmer
 * Body: { text: string, sourceLang: 'zh' | 'km', targetLang: 'zh' | 'km' }
 * Returns: { translatedText: string, audioUrl: string, historyId: number }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text, sourceLang, targetLang } = req.body;

    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();

    // Step 1: Translate using LLM
    const llmClient = new LLMClient(config, customHeaders);

    const sourceLangName = sourceLang === 'zh' ? '中文' : '高棉语（柬埔寨语）';
    const targetLangName = targetLang === 'zh' ? '中文' : '高棉语（柬埔寨语）';

    const messages = [
      {
        role: 'system' as const,
        content: `你是一位专业的${sourceLangName}和${targetLangName}翻译专家。请将用户输入的${sourceLangName}文本准确翻译为${targetLangName}。只输出翻译结果，不要添加任何解释、注释或额外内容。如果输入文本已经是目标语言，则直接返回原文。`,
      },
      {
        role: 'user' as const,
        content: text,
      },
    ];

    const translation = await llmClient.invoke(messages, {
      model: 'doubao-seed-2-0-mini-260215',
      temperature: 0.3,
    });

    const translatedText = translation.content.trim();

    // Step 2: Convert translated text to speech using TTS
    const ttsClient = new TTSClient(config, customHeaders);

    const speaker = targetLang === 'zh'
      ? 'zh_female_xiaohe_uranus_bigtts'
      : 'zh_female_vv_uranus_bigtts';

    let audioUrl = '';
    try {
      const ttsResponse = await ttsClient.synthesize({
        uid: 'translator-user',
        text: translatedText,
        speaker,
        audioFormat: 'mp3',
        sampleRate: 24000,
      });
      audioUrl = ttsResponse.audioUri || '';
      console.log('TTS Response:', JSON.stringify(ttsResponse));
    } catch (ttsError) {
      console.error('TTS synthesis failed:', ttsError);
      // TTS failure is not critical, continue without audio
    }

    // Step 3: Save to history
    let historyId: number | null = null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('translation_history')
        .insert({
          source_lang: sourceLang,
          target_lang: targetLang,
          source_text: text,
          translated_text: translatedText,
          audio_url: audioUrl,
        })
        .select('id')
        .single();

      if (error) throw new Error(`插入失败: ${error.message}`);
      historyId = data?.id ?? null;
    } catch (dbError) {
      console.error('Failed to save translation history:', dbError);
    }

    res.json({
      translatedText,
      audioUrl,
      historyId,
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: '翻译失败，请重试' });
  }
});

/**
 * POST /api/v1/translate/tts
 * Convert text to speech
 * Body: { text: string, lang: 'zh' | 'km' }
 * Returns: { audioUrl: string }
 */
router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, lang } = req.body;

    if (!text) {
      return res.status(400).json({ error: '缺少文本内容' });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const ttsClient = new TTSClient(config, customHeaders);

    const speaker = lang === 'zh'
      ? 'zh_female_xiaohe_uranus_bigtts'
      : 'zh_female_vv_uranus_bigtts';

    const response = await ttsClient.synthesize({
      uid: 'translator-user',
      text,
      speaker,
      audioFormat: 'mp3',
      sampleRate: 24000,
    });

    res.json({ audioUrl: response.audioUri });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: '语音合成失败，请重试' });
  }
});

/**
 * GET /api/v1/translate/history
 * Get translation history
 * Query: { page?: number, limit?: number }
 * Returns: { items: TranslationItem[], total: number }
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient();

    // Get total count
    const { count, error: countError } = await supabase
      .from('translation_history')
      .select('*', { count: 'exact', head: true });
    if (countError) throw new Error(`统计失败: ${countError.message}`);

    // Get paginated items
    const { data, error } = await supabase
      .from('translation_history')
      .select('id, source_lang, target_lang, source_text, translated_text, audio_url, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`查询失败: ${error.message}`);

    res.json({
      items: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

/**
 * DELETE /api/v1/translate/history/:id
 * Delete a translation history item
 * Params: id (number)
 */
router.delete('/history/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('translation_history')
      .delete()
      .eq('id', parseInt(id as string));

    if (error) throw new Error(`删除失败: ${error.message}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete history error:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

export default router;
