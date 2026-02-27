#!/usr/bin/env node
// ============================================================================
// Database Seed Script — Insert sample data for development/testing
// ============================================================================
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = process.argv[2] || './hospital_transparency.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function uuid() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

console.log('Seeding database...');

// Sample hospitals
const hospitals = [
  { name: 'Johns Hopkins Hospital', address: '1800 Orleans St', city: 'Baltimore', state: 'MD', zip: '21287', area_code: '410', lat: 39.2966, lng: -76.5928, type: 'Acute Care Hospitals' },
  { name: 'Mayo Clinic', address: '200 First St SW', city: 'Rochester', state: 'MN', zip: '55905', area_code: '507', lat: 44.0225, lng: -92.4666, type: 'Acute Care Hospitals' },
  { name: 'Cleveland Clinic', address: '9500 Euclid Ave', city: 'Cleveland', state: 'OH', zip: '44195', area_code: '216', lat: 41.5021, lng: -81.6213, type: 'Acute Care Hospitals' },
  { name: 'Massachusetts General Hospital', address: '55 Fruit St', city: 'Boston', state: 'MA', zip: '02114', area_code: '617', lat: 42.3632, lng: -71.0686, type: 'Acute Care Hospitals' },
  { name: 'UCLA Medical Center', address: '757 Westwood Plaza', city: 'Los Angeles', state: 'CA', zip: '90095', area_code: '310', lat: 34.0664, lng: -118.4463, type: 'Acute Care Hospitals' },
  { name: 'NYU Langone Health', address: '550 First Ave', city: 'New York', state: 'NY', zip: '10016', area_code: '212', lat: 40.7421, lng: -73.9740, type: 'Acute Care Hospitals' },
  { name: 'UCSF Medical Center', address: '505 Parnassus Ave', city: 'San Francisco', state: 'CA', zip: '94143', area_code: '415', lat: 37.7631, lng: -122.4580, type: 'Acute Care Hospitals' },
  { name: 'Penn Medicine', address: '3400 Spruce St', city: 'Philadelphia', state: 'PA', zip: '19104', area_code: '215', lat: 39.9504, lng: -75.1933, type: 'Acute Care Hospitals' },
  { name: 'Cedars-Sinai Medical Center', address: '8700 Beverly Blvd', city: 'Los Angeles', state: 'CA', zip: '90048', area_code: '323', lat: 34.0753, lng: -118.3805, type: 'Acute Care Hospitals' },
  { name: 'Mount Sinai Hospital', address: '1468 Madison Ave', city: 'New York', state: 'NY', zip: '10029', area_code: '212', lat: 40.7900, lng: -73.9526, type: 'Acute Care Hospitals' },
];

const insertHospital = db.prepare(
  `INSERT OR IGNORE INTO hospitals (hospital_id, name, address, city, state, zip, area_code, latitude, longitude, hospital_type)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const hospitalIds = [];
const insertManyHospitals = db.transaction(() => {
  for (const h of hospitals) {
    const id = uuid();
    hospitalIds.push(id);
    insertHospital.run(id, h.name, h.address, h.city, h.state, h.zip, h.area_code, h.lat, h.lng, h.type);
  }
});
insertManyHospitals();
console.log(`Inserted ${hospitals.length} sample hospitals`);

// Sample pricing data
const procedures = [
  { code: '27447', type: 'CPT', desc: 'Total Knee Replacement', base: 30000 },
  { code: '27130', type: 'CPT', desc: 'Total Hip Replacement', base: 28000 },
  { code: '59400', type: 'CPT', desc: 'Vaginal Delivery', base: 8000 },
  { code: '59510', type: 'CPT', desc: 'Cesarean Delivery', base: 14000 },
  { code: '99213', type: 'CPT', desc: 'Office Visit (Established, Low)', base: 120 },
  { code: '99285', type: 'CPT', desc: 'Emergency Dept Visit (High)', base: 2500 },
  { code: '45380', type: 'CPT', desc: 'Colonoscopy with Biopsy', base: 3500 },
  { code: '70553', type: 'CPT', desc: 'Brain MRI', base: 2800 },
  { code: '71046', type: 'CPT', desc: 'Chest X-Ray', base: 350 },
  { code: '93306', type: 'CPT', desc: 'Echocardiogram', base: 1800 },
  { code: '85025', type: 'CPT', desc: 'Complete Blood Count (CBC)', base: 35 },
  { code: '80053', type: 'CPT', desc: 'Comprehensive Metabolic Panel', base: 45 },
];

const priceTypes = ['gross_charge', 'discounted_cash', 'min_negotiated', 'max_negotiated'];
const payers = [null, 'Aetna', 'BlueCross BlueShield', 'Cigna', 'UnitedHealthcare', 'Humana'];

const insertPricing = db.prepare(
  `INSERT OR IGNORE INTO pricing_data_current
   (record_id, hospital_id, billing_code, billing_code_type, service_description,
    payer, price_type, price, row_hash)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertHistory = db.prepare(
  `INSERT INTO pricing_data_history
   (version_id, record_id, hospital_id, billing_code, billing_code_type, service_description,
    payer, price_type, price, row_hash, is_current)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
);

let pricingCount = 0;
const insertManyPricing = db.transaction(() => {
  for (const hospitalId of hospitalIds) {
    for (const proc of procedures) {
      for (const pt of priceTypes) {
        for (const payer of payers) {
          // Vary price by hospital, type, and payer
          const variation = 0.6 + Math.random() * 0.8;
          const typeMultiplier = pt === 'gross_charge' ? 1.0 : pt === 'discounted_cash' ? 0.6 : pt === 'min_negotiated' ? 0.4 : 0.85;
          const price = Math.round(proc.base * variation * typeMultiplier * 100) / 100;

          const recordId = uuid();
          const hash = crypto.createHash('sha256').update(`${hospitalId}|${proc.code}|${pt}|${payer ?? ''}|${price}`).digest('hex').slice(0, 16);

          insertPricing.run(recordId, hospitalId, proc.code, proc.type, proc.desc, payer, pt, price, hash);
          insertHistory.run(uuid(), recordId, hospitalId, proc.code, proc.type, proc.desc, payer, pt, price, hash);
          pricingCount++;
        }
      }
    }
  }
});
insertManyPricing();
console.log(`Inserted ${pricingCount} sample pricing records`);

db.close();
console.log('Seed complete!');
