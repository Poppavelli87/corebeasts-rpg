import { app } from 'electron';
import path from 'node:path';

export type RendererEntry =
  | {
      mode: 'url';
      value: string;
    }
  | {
      mode: 'file';
      value: string;
    };

export const getRendererEntry = (devServerUrl?: string): RendererEntry => {
  if (devServerUrl) {
    return { mode: 'url', value: devServerUrl };
  }

  return {
    mode: 'file',
    value: path.join(app.getAppPath(), 'dist', 'index.html')
  };
};
