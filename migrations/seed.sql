-- ============================================================================
-- BizPilot: Seed Data for Shree Ganesh Kirana Store
-- Migration: supabase/seed.sql
-- ============================================================================

-- 1. Create Default Demo Tenant
INSERT INTO tenants (id, slug, name, tier, region, sla_rate)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'shree-ganesh-kirana',
    'Shree Ganesh Kirana Store',
    'Retail Pro MSME',
    'Sector 14, Gurugram, Haryana',
    '99.9%'
) ON CONFLICT (slug) DO NOTHING;

-- 2. Create Owner User
INSERT INTO users (id, email, phone, full_name)
VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'rajesh.sharma@kirana-demo.local',
    '+91 98XXX X1001',
    'Rajesh Sharma (Owner)'
) ON CONFLICT (email) DO NOTHING;

-- 3. Link Membership as OWNER
INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'OWNER',
    TRUE
) ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 4. Seed 4 Mandi Wholesalers
INSERT INTO suppliers (id, tenant_id, name_en, name_hi, contact_person, phone, city, market_area, payment_terms, lead_time_days, product_categories)
VALUES
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Mahavir Grain & Pulses Wholesalers',
    'महावीर ग्रेन एवं दलहन आढ़ती',
    'Mahavir Jain',
    '+91 98XXX X1234',
    'Gurugram',
    'Khandsa Anaj Mandi',
    'Net 15 Days',
    1,
    ARRAY['Wheat Flour', 'Rice', 'Pulses & Dals', 'Grains']
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Laxmi Oil & FMCG Distribution Hub',
    'लक्ष्मी ऑयल एवं एफएमसीजी डिपो',
    'Suresh Gupta',
    '+91 98XXX X2345',
    'Delhi NCR',
    'Narela Wholesale Mandi',
    'Net 7 Days',
    2,
    ARRAY['Cooking Oils', 'Ghee', 'Soaps', 'Detergents']
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Shiv Shakti Spices & Tea Traders',
    'शिव शक्ति मसाले व चाय व्यापारी',
    'Pramod Agrawal',
    '+91 98XXX X3456',
    'Old Delhi',
    'Khari Baoli Spice Market',
    'Credit 21 Days',
    3,
    ARRAY['Whole Spices', 'Ground Spices', 'Assam CTC Tea']
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Vardhman Dairy & Packaged Foods',
    'वर्धमान डेयरी एवं पैकेज्ड फूड्स',
    'Naveen Shah',
    '+91 98XXX X4567',
    'Gurugram',
    'Pataudi Road Industrial Area',
    'Weekly Payment',
    1,
    ARRAY['Dairy Essentials', 'Biscuits', 'Namkeen Snacks']
) ON CONFLICT DO NOTHING;

-- 5. Seed 12 Kirana Grocery Products
INSERT INTO products (id, tenant_id, sku, name_en, name_hi, category_en, category_hi, available_qty, reorder_level, unit_en, unit_hi, cost_price, selling_price, status, primary_supplier_id, shelf_location, barcode)
VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SKU-ATTA-10K', 'Sharbati Whole Wheat Chakki Atta (10 kg)', 'शरबती गेहूं चक्की शुद्ध आटा (10 किग्रा)', 'Staples & Grains', 'अनाज व आटा', 18, 10, 'bags', 'बोरी', 390.00, 440.00, 'IN_STOCK', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'Stack A-1, Front Entrance', '890103001001'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SKU-RICE-05K', 'Traditional Long-Grain Basmati Rice (5 kg)', 'परंपरागत बासमती लंबा चावल (5 किग्रा)', 'Staples & Grains', 'अनाज व आटा', 14, 8, 'bags', 'बोरी', 420.00, 490.00, 'IN_STOCK', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'Stack A-2, Grain Bay', '890103001002'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SKU-DAL-01K', 'Desi Polished Toor / Arhar Dal (1 kg)', 'देसी पॉलिश अरहर / तूर दाल (1 किग्रा)', 'Pulses & Dals', 'दाल व दलहन', 6, 20, 'kg packs', 'पैकेट', 135.00, 160.00, 'LOW_STOCK', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'Shelf B-1, Pulses Row', '890103001003'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SKU-SUGAR-01', 'Sulfur-Free Premium White Sugar (1 kg)', 'सल्फर-मुक्त सफेद दानेदार चीनी (1 किग्रा)', 'Staples & Grains', 'अनाज व आटा', 32, 15, 'kg packs', 'पैकेट', 40.00, 46.00, 'IN_STOCK', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'Bin C-1, Sweeteners', '890103001004'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SKU-OIL-01L', 'Refined Sunflower Cooking Oil (1 Litre Pouch)', 'रिफाइंड सूर्यमुखी खाने का तेल (1 लीटर पाउच)', 'Edible Oils & Ghee', 'खाद्य तेल व घी', 4, 15, 'pouches', 'पाउच', 125.00, 145.00, 'LOW_STOCK', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'Crate D-2, Oil Corner', '890103001005'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SKU-TEA-500G', 'Assam Strong CTC Leaf Tea (500 g)', 'असम कड़क दानेदार चायपत्ती (500 ग्राम)', 'Beverages & Tea', 'चाय व पेय', 16, 8, 'packs', 'पैकेट', 180.00, 230.00, 'IN_STOCK', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'Shelf E-3, Tea Bay', '890103001006')
ON CONFLICT (tenant_id, sku) DO NOTHING;

-- 6. Seed Khata Customers
INSERT INTO customers (id, tenant_id, name_en, name_hi, phone, address, credit_limit, outstanding_balance, total_purchases)
VALUES
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Ramesh Kumar Gupta', 'रमेश कुमार गुप्ता', '+91 98XXX X1111', 'House #142, Street 4, Sector 14', 5000, 3850, 48200),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Sunita Sharma', 'सुनीता शर्मा', '+91 98XXX X2222', 'Flat 3B, Shanti Enclave', 4000, 1420, 22400),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Manoj Verma (Chai Point)', 'मनोज वर्मा (चाय पॉइंट)', '+91 98XXX X3333', 'Corner Stall, Main Market Road', 8000, 4600, 84000),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Pooja Aggarwal', 'पूजा अग्रवाल', '+91 98XXX X4444', 'Plot 58, Near Community Center', 3000, 980, 16800),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Vikram Singh (Driver)', 'विक्रम सिंह', '+91 98XXX X5555', 'House 12, Old Railway Colony', 5000, 3400, 31500)
ON CONFLICT DO NOTHING;

