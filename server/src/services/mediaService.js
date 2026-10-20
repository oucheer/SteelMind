/* AI 口播与视频生成服务（借鉴 MoneyPrinterTurbo 流水线架构）
   流水线：文案/分镜(LLM) → Edge TTS 配音(时间戳字幕) → ffmpeg 合成(背景+标题+字幕) → MP4 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ffmpeg/ffprobe：优先用项目 bin 目录的静态构建，回退到 npm 包
const BIN_DIR = path.join(__dirname, '..', '..', 'bin');
function resolveBin(name, pkg) {
  const local = path.join(BIN_DIR, `${name}.exe`);
  if (fs.existsSync(local)) return local;
  try { return require(pkg); } catch { /* 未安装 */ }
  return name; // 交给 PATH
}
const ffmpegPath = resolveBin('ffmpeg', 'ffmpeg-static');
const ffprobePath = resolveBin('ffprobe', 'ffprobe-static/path');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const FONT = 'C\\:/Windows/Fonts/msyh.ttc';

// 预置中文音色（Edge TTS 官方音色，免 API Key）
const VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女·亲切）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊（女·活泼）' },
  { value: 'zh-CN-YunjianNeural', label: '云健（男·磁性强健）' },
  { value: 'zh-CN-YunxiNeural', label: '云希（男·年轻）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男·新闻专业）' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北（女·东北）' },
  { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮（女·陕西）' },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 180000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${path.basename(cmd)} 失败: ${String(stderr || err.message).slice(0, 300)}`));
      resolve({ stdout, stderr });
    });
  });
}

async function getAudioDuration(file) {
  const { stdout } = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(stdout.trim()) || 3;
}

// 中文按宽度手动断行（drawtext 不自动换行 CJK）
function wrapCJK(text, perLine = 16) {
  const lines = [];
  for (const seg of String(text).split('\n')) {
    for (let i = 0; i < seg.length; i += perLine) lines.push(seg.slice(i, i + perLine));
  }
  return lines.join('\n');
}

// Edge TTS 合成：返回 { audio, srt, duration }；字幕由句级时间戳生成
async function ttsToFile(text, audioPath, { voice = 'zh-CN-XiaoxiaoNeural', rate = '+0%' } = {}) {
  const { EdgeTTS, Constants } = require('@andresaya/edge-tts');
  const tts = new EdgeTTS();
  await tts.synthesize(text, voice, {
    rate,
    outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
  });
  fs.writeFileSync(audioPath, tts.toBuffer());
  fs.writeFileSync(audioPath.replace(/\.mp3$/, '.srt'), tts.toSRT(), 'utf8');
  const duration = await getAudioDuration(audioPath);
  return { audio: audioPath, srt: audioPath.replace(/\.mp3$/, '.srt'), duration };
}

module.exports = { MEDIA_DIR, VOICES, FONT, run, getAudioDuration, wrapCJK, ttsToFile, ffmpegPath, ffprobePath };
