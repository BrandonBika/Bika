import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  callGeminiWithRetry,
  finalizeGeminiResult
} from '../supabase/functions/snap-and-say/handler.js';

const AUDIO_MIME_TYPES = new Map([
  ['.webm', 'audio/webm'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mp3'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/m4a'],
  ['.mp4', 'audio/m4a']
]);
const CSV_COLUMNS = [
  'file',
  'expected_language',
  'detected_language',
  'transcript',
  'english_translation',
  'expected_category',
  'category',
  'urgency',
  'transcription_confidence',
  'classification_confidence',
  'review_flag',
  'time_ms',
  'error'
];

function parseFilename(filename) {
  const match = filename.match(/^([a-z]{2,3})_(.+)_([^_.]+)(\.[^.]+)$/i);
  if (!match) return null;
  const extension = match[4].toLowerCase();
  if (!AUDIO_MIME_TYPES.has(extension)) return null;
  return {
    expectedLanguage: match[1].toLowerCase(),
    expectedCategory: match[2].toLowerCase().replaceAll('-', '_'),
    extension
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function parseGeminiResponse(response) {
  const text = response?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
  if (!text) throw new Error('No structured response');
  return JSON.parse(text);
}

function updateSummary(summary, key, isCorrect) {
  const item = summary.get(key) || { total: 0, correct: 0 };
  item.total += 1;
  if (isCorrect) item.correct += 1;
  summary.set(key, item);
}

function printSummary(label, summary) {
  console.log(`\n${label}`);
  for (const [key, { total, correct }] of [...summary.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const percentage = total ? ((correct / total) * 100).toFixed(1) : '0.0';
    console.log(`  ${key}: ${correct}/${total} (${percentage}%)`);
  }
}

export async function evaluateDirectory(inputDirectory, outputFile) {
  const files = (await readdir(inputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && parseFilename(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  if (!files.length) {
    throw new Error('No supported audio files found. Use names like zu_fire_01.webm.');
  }

  const env = { get: (name) => process.env[name] || '' };
  const languageSummary = new Map();
  const categorySummary = new Map();
  const rows = [];

  for (const filename of files) {
    const metadata = parseFilename(filename);
    const startedAt = Date.now();
    const row = {
      file: filename,
      expected_language: metadata.expectedLanguage,
      detected_language: '',
      transcript: '',
      english_translation: '',
      expected_category: metadata.expectedCategory,
      category: '',
      urgency: '',
      transcription_confidence: '',
      classification_confidence: '',
      review_flag: '',
      time_ms: '',
      error: ''
    };
    try {
      const audio = await readFile(path.join(inputDirectory, filename));
      const response = await callGeminiWithRetry({
        env,
        fetchImpl: fetch,
        payload: {
          audio_blob: new Blob([audio], { type: AUDIO_MIME_TYPES.get(metadata.extension) }),
          audio_mime_type: AUDIO_MIME_TYPES.get(metadata.extension),
          image_blob: null,
          latitude: null,
          longitude: null,
          location_accuracy: 0,
          gps_status: 'no_gps'
        }
      });
      const result = finalizeGeminiResult({ gps_status: 'no_gps' }, parseGeminiResponse(response.output));
      row.detected_language = result.detected_language;
      row.transcript = result.original_transcription;
      row.english_translation = result.english_translation;
      row.category = result.issue_category;
      row.urgency = result.urgency;
      row.transcription_confidence = result.transcription_confidence;
      row.classification_confidence = result.classification_confidence;
      row.review_flag = result.needs_human_review;
      updateSummary(languageSummary, row.expected_language, row.expected_language === row.detected_language);
      updateSummary(categorySummary, row.expected_category, row.expected_category === row.category);
    } catch (error) {
      row.error = error?.code || error?.name || 'EvaluationError';
      updateSummary(languageSummary, row.expected_language, false);
      updateSummary(categorySummary, row.expected_category, false);
    }
    row.time_ms = Date.now() - startedAt;
    rows.push(row);
    console.log(`Evaluated ${filename}`);
  }

  const csv = [
    CSV_COLUMNS.map(csvCell).join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))
  ].join('\r\n');
  await writeFile(outputFile, `${csv}\r\n`, 'utf8');
  printSummary('Language accuracy (expected code vs detected code)', languageSummary);
  printSummary('Category accuracy (expected category vs classified category)', categorySummary);
  console.log(`CSV written to ${outputFile}`);
}

async function main() {
  const [inputDirectory, outputArgument] = process.argv.slice(2);
  if (!inputDirectory) {
    throw new Error('Usage: node tools/eval-snap-languages.js <audio-folder> [output.csv]');
  }
  const absoluteInput = path.resolve(inputDirectory);
  const outputFile = path.resolve(outputArgument || 'snap-language-evaluation.csv');
  await evaluateDirectory(absoluteInput, outputFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Snap & Say evaluation stopped: ${error?.code || error?.name || 'Error'}`);
    process.exitCode = 1;
  });
}
