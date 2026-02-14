import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('corebeastsDesktop', {
  platform: process.platform,
  isDesktop: true
});
