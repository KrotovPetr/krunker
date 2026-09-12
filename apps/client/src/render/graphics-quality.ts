export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';

export type GraphicsProfile = {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: 512 | 1024 | 2048;
  mapDetails: 'reduced' | 'full';
};

export const GRAPHICS_QUALITY_STORAGE_KEY = 'browser-fps-graphics-quality';

const isGraphicsQuality = (value: string | null): value is GraphicsQuality =>
  value === 'auto' || value === 'low' || value === 'medium' || value === 'high';

export function loadGraphicsQuality(storage: Pick<Storage, 'getItem'>) {
  try {
    const saved = storage.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    return isGraphicsQuality(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveGraphicsQuality(
  storage: Pick<Storage, 'setItem'>,
  quality: GraphicsQuality,
) {
  try {
    storage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, quality);
  } catch {
    // Private browsing can deny storage. The setting still applies for this page.
  }
}

export function resolveGraphicsProfile(
  quality: GraphicsQuality,
  devicePixelRatio: number,
  hardwareConcurrency?: number,
  deviceMemory?: number,
): GraphicsProfile {
  let resolved = quality;
  if (quality === 'auto') {
    const constrainedMemory = deviceMemory !== undefined && deviceMemory <= 4;
    const constrainedCpu =
      hardwareConcurrency !== undefined && hardwareConcurrency <= 4;
    resolved = constrainedMemory || constrainedCpu ? 'low' : 'medium';
  }

  const safeDeviceRatio = Math.max(0.5, devicePixelRatio || 1);
  if (resolved === 'low')
    return {
      pixelRatio: Math.min(safeDeviceRatio, 0.75),
      shadows: false,
      shadowMapSize: 512,
      mapDetails: 'reduced',
    };
  if (resolved === 'medium')
    return {
      pixelRatio: Math.min(safeDeviceRatio, 1),
      shadows: true,
      shadowMapSize: 1024,
      mapDetails: 'full',
    };
  return {
    pixelRatio: Math.min(safeDeviceRatio, 2),
    shadows: true,
    shadowMapSize: 2048,
    mapDetails: 'full',
  };
}
