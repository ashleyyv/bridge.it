-- Add industry_type for Enterprise Lead Library filtering (Legal, Medical, E-commerce)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry_type text;
