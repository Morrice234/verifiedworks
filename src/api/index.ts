// Picks the backend: the Express server when EXPO_PUBLIC_API_URL is set,
// otherwise the offline mock that lives on the phone.
import { httpBackend } from './http';
import { mockBackend } from './mock';
import type { Backend } from './types';

export * from './types';

export const api: Backend = process.env.EXPO_PUBLIC_API_URL ? httpBackend : mockBackend;
