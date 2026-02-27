// ============================================================================
// Hospital Price Transparency Intelligence Platform — Constants
// ============================================================================

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

export const COMMON_TRANSPARENCY_PATHS = [
  '/chargemaster',
  '/pricing',
  '/price-transparency',
  '/standard-charges',
  '/machine-readable',
  '/patient-pricing',
  '/billing',
  '/financial-information',
  '/charges',
];

export const TRANSPARENCY_FILE_PATTERNS = [
  /standard.?charges/i,
  /chargemaster/i,
  /price.?transparency/i,
  /machine.?readable/i,
  /gross.?charges/i,
  /billing.?codes/i,
  /cdm/i,
  /charge.?description/i,
];

export const SUPPORTED_FILE_EXTENSIONS = [
  '.csv', '.json', '.xml', '.xls', '.xlsx', '.pdf', '.gz', '.zip',
];

export const BILLING_CODE_PATTERNS: Record<string, RegExp> = {
  CPT: /^\d{5}$/,
  HCPCS: /^[A-V]\d{4}$/,
  DRG: /^\d{3}$/,
  'MS-DRG': /^\d{3}$/,
  'ICD-10': /^[A-Z]\d{2}(\.\d{1,4})?$/,
  NDC: /^\d{5}-\d{4}-\d{2}$/,
};

export const PRICE_TYPE_LABELS: Record<string, string> = {
  gross_charge: 'Gross Charge',
  discounted_cash: 'Discounted Cash Price',
  min_negotiated: 'Minimum Negotiated Rate',
  max_negotiated: 'Maximum Negotiated Rate',
  payer_specific: 'Payer-Specific Negotiated Rate',
  de_identified_min: 'De-identified Minimum',
  de_identified_max: 'De-identified Maximum',
};

export const COMMON_CPT_CODES: Record<string, string> = {
  '27447': 'Total Knee Replacement',
  '27130': 'Total Hip Replacement',
  '59400': 'Vaginal Delivery',
  '59510': 'Cesarean Delivery',
  '99213': 'Office Visit (Established, Low)',
  '99214': 'Office Visit (Established, Moderate)',
  '99283': 'Emergency Dept Visit (Moderate)',
  '99285': 'Emergency Dept Visit (High)',
  '43239': 'Upper GI Endoscopy with Biopsy',
  '45380': 'Colonoscopy with Biopsy',
  '70553': 'Brain MRI',
  '71046': 'Chest X-Ray',
  '73721': 'MRI Lower Extremity Joint',
  '74177': 'CT Abdomen/Pelvis with Contrast',
  '93000': 'Electrocardiogram (ECG)',
  '93306': 'Echocardiogram',
  '36415': 'Blood Draw (Venipuncture)',
  '80053': 'Comprehensive Metabolic Panel',
  '85025': 'Complete Blood Count (CBC)',
};

export const CMS_HOSPITAL_DATA_URL =
  'https://data.cms.gov/provider-data/api/1/datastore/sql?query=%5BSELECT%20%2A%20FROM%20xubh-q36u%5D%5BLIMIT%20100%5D';

export const CMS_HOSPITAL_GENERAL_CSV =
  'https://data.cms.gov/provider-data/sites/default/files/resources/092b30de4bdf1bb4a5aa76b3c3c65826/Hospital_General_Information.csv';
