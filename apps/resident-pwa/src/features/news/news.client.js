/**
 * @file apps/resident-pwa/src/features/news/news.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getNews() {
  return await invokeFunction(Endpoints.NEWS_LIST);
}
