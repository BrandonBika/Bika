import { getStaffContext } from '../session.js';
import { supabase } from './supabase.client.js';
import { withTimeout } from './with-timeout.js';
import { validateBoundaryFile, validateBoundaryContent } from './boundaries.validation.js';

const BUCKET = 'admin-boundaries';
const PAGE_SIZE = 1000;

let boundaryListCache = null;
const parsedBoundaryCache = new Map();

export async function listBoundaries() {
  return withTimeout((async () => {
    if (boundaryListCache) return boundaryListCache;
    const objects = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.storage.from(BUCKET).list('', {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      throwStorageError(error);
      const page = data ?? [];
      objects.push(...page.filter((object) => object.id !== null));
      if (page.length < PAGE_SIZE) break;
    }
    boundaryListCache = objects.map((object) => ({
      path: object.name,
      name: displayName(object.name),
      size: object.metadata?.size ?? 0,
      createdAt: object.created_at ?? object.updated_at ?? null
    })).sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
      return rightTime - leftTime;
    });
    return boundaryListCache;
  })(), 'Boundary list');
}

export async function uploadBoundary(file, displayNameValue = '') {
  return withTimeout((async () => {
    const validated = await validateBoundaryFile(file);
    const slug = slugify(displayNameValue || file.name.replace(/\.geojson$/i, ''));
    const path = `${Date.now()}-${slug}.geojson`;
    const body = new Blob([JSON.stringify(validated.geojson)], {
      type: 'application/geo+json'
    });
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType: 'application/geo+json',
      upsert: false
    });
    throwStorageError(error);
    boundaryListCache = null;
    const parsed = {
      geojson: validated.geojson,
      featureCount: validated.featureCount,
      warnings: validated.warnings
    };
    parsedBoundaryCache.set(path, parsed);
    return {
      path,
      name: displayName(path),
      size: body.size,
      featureCount: validated.featureCount,
      warnings: validated.warnings,
      geojson: parsed.geojson
    };
  })(), 'Boundary upload');
}

export async function downloadBoundary(path) {
  return withTimeout((async () => {
    if (parsedBoundaryCache.has(path)) return parsedBoundaryCache.get(path);
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    throwStorageError(error);
    if (!data) throw new Error('The boundary file could not be downloaded.');
    const parsed = await validateBoundaryContent(await data.text());
    parsedBoundaryCache.set(path, parsed);
    return parsed;
  })(), 'Boundary download');
}

export async function deleteBoundary(path) {
  return withTimeout((async () => {
    if (getStaffContext()?.role !== 'platform_admin') {
      throw new Error("You don't have permission to delete boundaries.");
    }
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    throwStorageError(error);
    boundaryListCache = null;
    parsedBoundaryCache.delete(path);
    return true;
  })(), 'Boundary deletion');
}

function throwStorageError(error) {
  if (!error) return;
  if (Number(error.statusCode ?? error.status) === 403) {
    throw new Error("You don't have permission to access this boundary.");
  }
  if (Number(error.statusCode ?? error.status) === 404) {
    throw new Error('The boundary was not found.');
  }
  console.error('Boundary storage request failed.', error);
  throw new Error(error.message || 'The boundary storage request failed. Please try again.');
}

function displayName(path) {
  return String(path).replace(/^\d+-/, '').replace(/\.geojson$/i, '').replace(/-/g, ' ');
}

function slugify(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'boundary';
}
