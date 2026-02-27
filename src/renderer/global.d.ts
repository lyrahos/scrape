// Global type declarations for renderer process

interface ElectronAPI {
  searchHospitals: (query: string) => Promise<unknown[]>;
  getHospital: (id: string) => Promise<unknown>;
  listHospitalsByState: (state: string) => Promise<unknown[]>;
  getHospitalStats: () => Promise<unknown>;
  discoverHospitals: () => Promise<{ count: number }>;
  scrapeHospitalFile: (hospitalId: string) => Promise<unknown>;
  onIngestionProgress: (cb: (progress: unknown) => void) => void;
  runUpdate: () => Promise<unknown>;
  getUpdateLog: (limit?: number) => Promise<unknown[]>;
  onUpdateStatus: (cb: (status: unknown) => void) => void;
  onUpdateComplete: (cb: (result: unknown) => void) => void;
  getStateMap: (billingCode?: string, priceType?: string, payer?: string, startDate?: string, endDate?: string) => Promise<unknown[]>;
  getTrends: (billingCode: string, state?: string, areaCode?: string) => Promise<unknown[]>;
  getTrendsComparison: (billingCode: string, hospitalId?: string, areaCode?: string, state?: string) => Promise<unknown[]>;
  getVariability: (limit?: number) => Promise<unknown[]>;
  getComparison: (billingCode: string, areaCode: string, startDate: string, endDate: string) => Promise<unknown[]>;
  semanticQuery: (query: string) => Promise<unknown>;
  getSettings: () => Promise<unknown>;
  getDbStatus: () => Promise<unknown>;
}

interface Window {
  electronAPI: ElectronAPI;
}

declare module 'react-simple-maps' {
  import { ComponentType, ReactNode, CSSProperties } from 'react';

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: CSSProperties;
    children?: ReactNode;
  }

  interface ZoomableGroupProps {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    children?: ReactNode;
  }

  interface GeographiesProps {
    geography: string | Record<string, unknown>;
    children: (data: { geographies: GeographyFeature[] }) => ReactNode;
  }

  interface GeographyFeature {
    id: string;
    rsmKey: string;
    properties: Record<string, unknown>;
    type: string;
    geometry: Record<string, unknown>;
  }

  interface GeographyProps {
    geography: GeographyFeature;
    key?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
    onMouseEnter?: (event: React.MouseEvent<SVGPathElement>) => void;
    onMouseLeave?: (event: React.MouseEvent<SVGPathElement>) => void;
    onClick?: (event: React.MouseEvent<SVGPathElement>) => void;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
}
