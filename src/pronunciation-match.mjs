function latin(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function textRatio(target, spoken) {
  const targetWords = target.split(/\s+/);
  const spokenWords = spoken.split(/\s+/);
  let matchingWords = 0;
  for (const word of targetWords) if (spokenWords.includes(word)) matchingWords++;
  const wordRatio = matchingWords / Math.max(targetWords.length, spokenWords.length);
  const matrix = Array.from({ length: target.length + 1 }, () => new Array(spoken.length + 1).fill(0));
  for (let i = 0; i <= target.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= spoken.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= target.length; i++) {
    for (let j = 1; j <= spoken.length; j++) {
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (target[i - 1] === spoken[j - 1] ? 0 : 1));
    }
  }
  const maxLen = Math.max(target.length, spoken.length);
  const charRatio = maxLen > 0 ? 1 - matrix[target.length][spoken.length] / maxLen : 1;
  return Math.max(5, Math.min(74, Math.floor(Math.max(wordRatio, charRatio) * 100)));
}

function result(score, passed, feedback) {
  return { score, passed, feedback, stress: passed ? 'Accurate' : 'Needs work', phonemes: passed ? 'Clear' : 'Unclear' };
}

function finiteList(value, length) {
  return Array.isArray(value) && value.length === length && value.every(item => Number.isFinite(item) && item >= 0 && item <= 1);
}

export function isPronunciationFeatures(value) {
  return !!value && finiteList(value.energy, 8) && finiteList(value.zcr, 8) && finiteList(value.pitch, 4) && Number.isFinite(value.breath) && value.breath >= 0 && value.breath <= 1;
}

function seriesScore(left, right) {
  let sum = 0;
  for (let i = 0; i < left.length; i++) sum += Math.abs(left[i] - right[i]);
  const mean = sum / left.length;
  if (mean <= 0.02) return 100;
  return Math.min(99, Math.floor((1 - Math.min(1, mean)) * 100));
}

function pitchScore(left, right) {
  const base = seriesScore(left, right);
  const direction = list => {
    const first = list.find(item => item > 0);
    const last = [...list].reverse().find(item => item > 0);
    if (first == null || last == null) return 0;
    return Math.sign(last - first);
  };
  const a = direction(left);
  const b = direction(right);
  if (a && b && a !== b) return Math.min(base, 40);
  return base;
}

function breathScore(left, right) {
  const gap = Math.abs(left - right);
  if (gap <= 0.02) return 100;
  return Math.min(99, Math.floor((1 - Math.min(1, gap)) * 100));
}

function atRate(samples, sampleRate) {
  if (sampleRate === 16000) return samples;
  const outLength = Math.floor(samples.length * 16000 / sampleRate);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * sampleRate / 16000;
    const left = Math.floor(pos);
    const mix = pos - left;
    const a = samples[left] || 0;
    const b = samples[left + 1] || a;
    out[i] = a + (b - a) * mix;
  }
  return out;
}

export function extractPronunciationFeatures(samples, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) return null;
  const source = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const data = atRate(source, sampleRate);
  const bins = 8;
  const size = Math.floor(data.length / bins);
  if (size < 2) return null;
  const energy = [];
  const zcr = [];
  for (let bin = 0; bin < bins; bin++) {
    let sum = 0;
    let crosses = 0;
    let prev = 0;
    const start = bin * size;
    for (let i = 0; i < size; i++) {
      const value = data[start + i];
      sum += value * value;
      if (i && (value >= 0) !== (prev >= 0)) crosses++;
      prev = value;
    }
    energy.push(Math.sqrt(sum / size));
    zcr.push(crosses / size);
  }
  const peak = Math.max(...energy, 1e-9);
  for (let i = 0; i < bins; i++) energy[i] = Math.min(1, energy[i] / peak);
  const pitch = [];
  const frame = Math.floor(data.length / 4);
  const minLag = Math.max(1, Math.floor(16000 / 400));
  const maxLag = Math.max(minLag + 1, Math.floor(16000 / 70));
  for (let frameIndex = 0; frameIndex < 4; frameIndex++) {
    const start = frameIndex * frame;
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag && lag < frame; lag++) {
      let corr = 0;
      for (let i = 0; i < frame - lag; i += 4) corr += data[start + i] * data[start + i + lag];
      if (corr > best) {
        best = corr;
        bestLag = lag;
      }
    }
    pitch.push(bestLag ? Math.min(1, (16000 / bestLag) / 400) : 0);
  }
  let diff = 0;
  let power = 0;
  for (let i = 1; i < data.length; i += 2) {
    diff += Math.abs(data[i] - data[i - 1]);
    power += data[i] * data[i];
  }
  const breath = power > 0 ? Math.min(1, diff / Math.sqrt(power) / 10) : 0;
  return { energy, zcr, pitch, breath };
}

export function featuresFromWav(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = at => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let at = 12;
  let rate = 0;
  let dataAt = 0;
  let dataSize = 0;
  while (at + 8 <= bytes.length) {
    const name = tag(at);
    const size = view.getUint32(at + 4, true);
    const start = at + 8;
    if (size > bytes.length - start) return null;
    if (name === 'fmt ') {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || view.getUint16(start + 14, true) !== 16) return null;
      rate = view.getUint32(start + 4, true);
    }
    if (name === 'data') {
      dataAt = start;
      dataSize = size - (size % 2);
    }
    at = start + size + (size % 2);
  }
  if (!rate || !dataSize) return null;
  const samples = new Float32Array(dataSize / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataAt + i * 2, true) / 32768;
  return extractPronunciationFeatures(samples, rate);
}

export function assessPronunciation({ target = '', spoken = '', student = null, etalon = null } = {}) {
  const rawSpoken = String(spoken || '').trim();
  const normTarget = latin(target);
  const normSpoken = latin(rawSpoken);
  if (!normTarget) return result(0, false, 'Reference pronunciation is not ready.');
  if (!rawSpoken) return result(0, false, 'Nothing was heard. Say the word, then check again.');
  if (!normSpoken) return result(0, false, 'Heard: "' + rawSpoken + '" · Expected: "' + target + '".');
  if (normTarget !== normSpoken) {
    const score = textRatio(normTarget, normSpoken);
    return result(score, false, 'Pronunciation mismatch. Heard: "' + rawSpoken + '" · Expected: "' + target + '". Try articulating each syllable clearly.');
  }
  if (!isPronunciationFeatures(student) || !isPronunciationFeatures(etalon)) return result(0, false, 'Reference pronunciation is not ready.');
  const sound = seriesScore(student.zcr, etalon.zcr);
  const stress = seriesScore(student.energy, etalon.energy);
  const tone = pitchScore(student.pitch, etalon.pitch);
  const breath = breathScore(student.breath, etalon.breath);
  const score = Math.min(sound, stress, tone, breath);
  const passed = score >= 75;
  const feedback = score === 100
    ? 'Pronunciation matches the reference.'
    : 'Pronunciation is short of the reference. Sounds ' + sound + '%, stress ' + stress + '%, intonation ' + tone + '%, breath ' + breath + '%.';
  return { score, passed, feedback, stress: stress === 100 ? 'Accurate' : 'Needs work', phonemes: sound === 100 ? 'Clear' : 'Unclear' };
}
