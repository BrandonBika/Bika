/**
 * @file apps/resident-pwa/src/features/account/account.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function exportMyData() {
  return await invokeFunction(Endpoints.ACCOUNT_EXPORT);
}

export async function deleteMyAccount(password) {
  return await invokeFunction(Endpoints.ACCOUNT_DELETE, { password });
}
