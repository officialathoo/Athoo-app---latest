-- Pakistan Location System unification:
-- 1) Normalize legacy province spellings/abbreviations in service_areas to the
--    canonical Pakistan province/territory names used everywhere else in the app
--    (ICT -> Islamabad Capital Territory, KPK -> Khyber Pakhtunkhwa), so admin
--    filtering and validation never has to special-case old data.
-- Drop the legacy-spelled row where a canonical-spelled duplicate of the same
-- city already exists (service_areas is a lookup table with no foreign-key
-- references, so removing an exact duplicate loses no bookings/user data).
DELETE FROM service_areas legacy
WHERE legacy.province IN ('ICT', 'Ict', 'Federal', 'KPK', 'Kpk', 'NWFP')
  AND EXISTS (
    SELECT 1 FROM service_areas canonical
    WHERE canonical.id <> legacy.id
      AND lower(TRIM(canonical.name)) = lower(TRIM(legacy.name))
      AND canonical.province = CASE legacy.province
            WHEN 'ICT' THEN 'Islamabad Capital Territory'
            WHEN 'Ict' THEN 'Islamabad Capital Territory'
            WHEN 'Federal' THEN 'Islamabad Capital Territory'
            WHEN 'KPK' THEN 'Khyber Pakhtunkhwa'
            WHEN 'Kpk' THEN 'Khyber Pakhtunkhwa'
            WHEN 'NWFP' THEN 'Khyber Pakhtunkhwa'
          END
  );

UPDATE service_areas SET province = 'Islamabad Capital Territory' WHERE province IN ('ICT', 'Ict', 'Federal');
UPDATE service_areas SET province = 'Khyber Pakhtunkhwa' WHERE province IN ('KPK', 'Kpk', 'NWFP');

-- 2) Backfill genuinely Pakistan-wide city coverage (all provinces + AJK + GB) into
--    service_areas. Append-only: only inserts cities that do not already exist,
--    never touches or removes existing admin-managed rows.
INSERT INTO service_areas (id, name, province, is_active, sort_order, created_at, updated_at)
VALUES
  ('area-lahore-pk', 'Lahore', 'Punjab', TRUE, 100, NOW(), NOW()),
  ('area-faisalabad-pk', 'Faisalabad', 'Punjab', TRUE, 101, NOW(), NOW()),
  ('area-rawalpindi-pk', 'Rawalpindi', 'Punjab', TRUE, 102, NOW(), NOW()),
  ('area-multan-pk', 'Multan', 'Punjab', TRUE, 103, NOW(), NOW()),
  ('area-gujranwala-pk', 'Gujranwala', 'Punjab', TRUE, 104, NOW(), NOW()),
  ('area-sialkot-pk', 'Sialkot', 'Punjab', TRUE, 105, NOW(), NOW()),
  ('area-bahawalpur-pk', 'Bahawalpur', 'Punjab', TRUE, 106, NOW(), NOW()),
  ('area-sargodha-pk', 'Sargodha', 'Punjab', TRUE, 107, NOW(), NOW()),
  ('area-sahiwal-pk', 'Sahiwal', 'Punjab', TRUE, 108, NOW(), NOW()),
  ('area-sheikhupura-pk', 'Sheikhupura', 'Punjab', TRUE, 109, NOW(), NOW()),
  ('area-jhang-pk', 'Jhang', 'Punjab', TRUE, 110, NOW(), NOW()),
  ('area-gujrat-pk', 'Gujrat', 'Punjab', TRUE, 111, NOW(), NOW()),
  ('area-kasur-pk', 'Kasur', 'Punjab', TRUE, 112, NOW(), NOW()),
  ('area-okara-pk', 'Okara', 'Punjab', TRUE, 113, NOW(), NOW()),
  ('area-dg-khan-pk', 'Dera Ghazi Khan', 'Punjab', TRUE, 114, NOW(), NOW()),
  ('area-ryk-pk', 'Rahim Yar Khan', 'Punjab', TRUE, 115, NOW(), NOW()),
  ('area-attock-pk', 'Attock', 'Punjab', TRUE, 116, NOW(), NOW()),
  ('area-wah-pk', 'Wah Cantonment', 'Punjab', TRUE, 117, NOW(), NOW()),
  ('area-chiniot-pk', 'Chiniot', 'Punjab', TRUE, 118, NOW(), NOW()),
  ('area-vehari-pk', 'Vehari', 'Punjab', TRUE, 119, NOW(), NOW()),
  ('area-karachi-pk', 'Karachi', 'Sindh', TRUE, 120, NOW(), NOW()),
  ('area-hyderabad-pk', 'Hyderabad', 'Sindh', TRUE, 121, NOW(), NOW()),
  ('area-sukkur-pk', 'Sukkur', 'Sindh', TRUE, 122, NOW(), NOW()),
  ('area-larkana-pk', 'Larkana', 'Sindh', TRUE, 123, NOW(), NOW()),
  ('area-nawabshah-pk', 'Nawabshah', 'Sindh', TRUE, 124, NOW(), NOW()),
  ('area-mirpurkhas-pk', 'Mirpur Khas', 'Sindh', TRUE, 125, NOW(), NOW()),
  ('area-jacobabad-pk', 'Jacobabad', 'Sindh', TRUE, 126, NOW(), NOW()),
  ('area-shikarpur-pk', 'Shikarpur', 'Sindh', TRUE, 127, NOW(), NOW()),
  ('area-peshawar-pk', 'Peshawar', 'Khyber Pakhtunkhwa', TRUE, 128, NOW(), NOW()),
  ('area-mardan-pk', 'Mardan', 'Khyber Pakhtunkhwa', TRUE, 129, NOW(), NOW()),
  ('area-abbottabad-pk', 'Abbottabad', 'Khyber Pakhtunkhwa', TRUE, 130, NOW(), NOW()),
  ('area-swat-pk', 'Swat', 'Khyber Pakhtunkhwa', TRUE, 131, NOW(), NOW()),
  ('area-kohat-pk', 'Kohat', 'Khyber Pakhtunkhwa', TRUE, 132, NOW(), NOW()),
  ('area-bannu-pk', 'Bannu', 'Khyber Pakhtunkhwa', TRUE, 133, NOW(), NOW()),
  ('area-dikhan-pk', 'Dera Ismail Khan', 'Khyber Pakhtunkhwa', TRUE, 134, NOW(), NOW()),
  ('area-nowshera-pk', 'Nowshera', 'Khyber Pakhtunkhwa', TRUE, 135, NOW(), NOW()),
  ('area-quetta-pk', 'Quetta', 'Balochistan', TRUE, 136, NOW(), NOW()),
  ('area-gwadar-pk', 'Gwadar', 'Balochistan', TRUE, 137, NOW(), NOW()),
  ('area-sibi-pk', 'Sibi', 'Balochistan', TRUE, 138, NOW(), NOW()),
  ('area-turbat-pk', 'Turbat', 'Balochistan', TRUE, 139, NOW(), NOW()),
  ('area-khuzdar-pk', 'Khuzdar', 'Balochistan', TRUE, 140, NOW(), NOW()),
  ('area-chaman-pk', 'Chaman', 'Balochistan', TRUE, 141, NOW(), NOW()),
  ('area-islamabad-pk', 'Islamabad', 'Islamabad Capital Territory', TRUE, 142, NOW(), NOW()),
  ('area-muzaffarabad-pk', 'Muzaffarabad', 'Azad Jammu & Kashmir', TRUE, 143, NOW(), NOW()),
  ('area-mirpur-ajk-pk', 'Mirpur', 'Azad Jammu & Kashmir', TRUE, 144, NOW(), NOW()),
  ('area-rawalakot-pk', 'Rawalakot', 'Azad Jammu & Kashmir', TRUE, 145, NOW(), NOW()),
  ('area-gilgit-pk', 'Gilgit', 'Gilgit-Baltistan', TRUE, 146, NOW(), NOW()),
  ('area-skardu-pk', 'Skardu', 'Gilgit-Baltistan', TRUE, 147, NOW(), NOW()),
  ('area-hunza-pk', 'Hunza', 'Gilgit-Baltistan', TRUE, 148, NOW(), NOW())
ON CONFLICT (lower(TRIM(name)), lower(TRIM(COALESCE(province, ''))))
DO NOTHING;
