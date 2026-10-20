/* AI 口播 / AI 视频路由 */
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { audit } = require('../services/auditService');
const { chat } = require('../services/llm');
const { MEDIA_DIR, VOICES, FONT, run, getAudioDuration, wrapCJK, ttsToFile, ffmpegPath } = require('../services/mediaService');

const urlOf = (f) => `/files/media/${path.basename(f)}`;

// 音色列表
router.get('/voices', (req, res) => res.json(VOICES));

// ============ AI 口播：文案(或LLM生成) → Edge TTS → MP3 + SRT ============
router.post('/voiceover', async (req, res) => {
  try {
    const { text, product, style, voice = 'zh-CN-XiaoxiaoNeural', rate = '+0%', polish = false } = req.body || {};
    if (!text && !product) return res.status(400).json({ error: '请提供口播文案或产品名' });
    let script = text;
    if (!script) {
      const r = await chat([{ role: 'user', content:
        `为钢制家具产品写一段${style || '种草带货'}风格的口播文案（抖音口播，25秒内，口语化，有钩子开头和行动号召），只输出文案本身，不要标题和引号。\n产品：${product}` }],
        { temperature: 0.8 });
      script = String(r).trim().replace(/^["'「『]+|["'」』]+$/g, '');
    }
    const id = uuid();
    const audioPath = path.join(MEDIA_DIR, `vo_${id}.mp3`);
    const { srt, duration } = await ttsToFile(script, audioPath, { voice, rate });
    audit(req, 'AI 生成口播', 'material', id, null, { duration, chars: script.length });
    res.json({
      id, script, duration: Math.round(duration * 10) / 10,
      audio_url: urlOf(audioPath), srt_url: urlOf(srt), voice,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ AI 视频：主题 → 分镜(LLM) → 逐镜TTS → ffmpeg合成 → MP4 ============
router.post('/video', async (req, res) => {
  try {
    const { theme, product, voice = 'zh-CN-XiaoxiaoNeural', ratio = '9:16' } = req.body || {};
    if (!theme && !product) return res.status(400).json({ error: '请提供视频主题或产品' });
    const W = ratio === '16:9' ? 1920 : 1080;
    const H = ratio === '16:9' ? 1080 : 1920;

    // 1. LLM 生成分镜脚本（严格 JSON）
    const prompt = `你是钢制家具行业短视频编导。围绕主题生成一条${ratio === '16:9' ? '横屏' : '竖屏'}带货短视频的分镜脚本，输出 JSON：
{"title":"视频标题","scenes":[{"title":"本镜大字标题(8字内)","text":"本镜口播词(30字内,口语化)","color":"本镜背景色hex如#16213E"}]}
要求：4到5个分镜；第一个分镜是抓人钩子，最后一个有行动号召；口播词连起来是一段完整通顺的话。
主题：${theme || product}`;
    const result = await chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.8 });
    const scenes = (result.scenes || []).slice(0, 6);
    if (!scenes.length) throw new Error('AI 未生成分镜');

    const id = uuid();
    const workDir = path.join(MEDIA_DIR, `work_${id}`);
    fs.mkdirSync(workDir, { recursive: true });

    // 2. 逐镜 TTS
    let n = 0;
    for (const s of scenes) {
      s.i = n++;
      const { audio, duration } = await ttsToFile(s.text, path.join(workDir, `sc_${s.i}.mp3`), { voice });
      s.audio = audio; s.dur = Math.max(duration + 0.6, 2.5);
    }

    // 3. 逐镜 ffmpeg 渲染（渐变感：底色 + 半透明色块标题条 + 大字标题 + 口播字幕文本）
    const clipFiles = [];
    for (const s of scenes) {
      const clip = path.join(workDir, `clip_${s.i}.mp4`);
      const titleFile = path.join(workDir, `title_${s.i}.txt`);
      const textFile = path.join(workDir, `text_${s.i}.txt`);
      fs.writeFileSync(titleFile, wrapCJK(s.title, Math.floor(W / 110)), 'utf8');
      fs.writeFileSync(textFile, wrapCJK(s.text, Math.floor(W / 62)), 'utf8');
      const color = /^#[0-9a-fA-F]{6}$/.test(s.color || '') ? s.color : '#16213E';
      const titleSize = Math.round(W / 12), textSize = Math.round(W / 26);
      const titleY = `h*0.22`, textY = `h-${Math.round(H * 0.28)}`;
      const vf = [
        `drawbox=x=0:y=${Math.round(H * 0.18)}:w=iw:h=${Math.round(H * 0.16)}:color=black@0.35:t=fill`,
        `drawtext=fontfile='${FONT}':textfile='${titleFile.replace(/\\/g, '/').replace(':', '\\:')}'` +
          `:fontsize=${titleSize}:fontcolor=white:x=(w-text_w)/2:y=${titleY}:line_spacing=${Math.round(titleSize * 0.35)}`,
        `drawbox=x=0:y=${Math.round(H * 0.66)}:w=iw:h=${Math.round(H * 0.22)}:color=black@0.45:t=fill`,
        `drawtext=fontfile='${FONT}':textfile='${textFile.replace(/\\/g, '/').replace(':', '\\:')}'` +
          `:fontsize=${textSize}:fontcolor=0xEAF2FF:x=(w-text_w)/2:y=${textY}:line_spacing=${Math.round(textSize * 0.5)}`,
        `drawtext=fontfile='${FONT}':text='SteelMind 智能营销':fontsize=${Math.round(W / 42)}:fontcolor=white@0.55:x=(w-text_w)/2:y=h-${Math.round(H * 0.045)}`,
      ].join(',');
      await run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', `color=c=0x0E1626:s=${W}x${H}:d=${s.dur.toFixed(2)}`,
        '-i', s.audio,
        '-vf', `drawbox=x=0:y=0:w=iw:h=ih:color=${color}@0.82:t=fill,${vf}`,
        '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', clip]);
      clipFiles.push(clip);
    }

    // 4. concat 拼接
    const listFile = path.join(workDir, 'list.txt');
    fs.writeFileSync(listFile, clipFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const outFile = path.join(MEDIA_DIR, `video_${id}.mp4`);
    await run(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', outFile]);

    // 5. 清理工作目录、登记素材
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* 清理失败不影响成片 */ }
    const totalDur = scenes.reduce((s, x) => s + x.dur, 0);
    db.prepare(`INSERT INTO materials (id,title,type,url_or_content,tags,platform,status,uploader_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, `${result.title || 'AI 视频'}（AI生成）`, 'video', urlOf(outFile),
        JSON.stringify(scenes.map((s) => s.title)), '抖音', 'AI生成', req.user?.id || null, new Date().toISOString().replace('T', ' ').slice(0, 19), new Date().toISOString().replace('T', ' ').slice(0, 19));
    audit(req, 'AI 生成视频', 'material', id, null, { title: result.title, scenes: scenes.length, duration: Math.round(totalDur) });
    res.json({
      id, title: result.title, duration: Math.round(totalDur), ratio,
      video_url: urlOf(outFile),
      scenes: scenes.map((s) => ({ title: s.title, text: s.text })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
