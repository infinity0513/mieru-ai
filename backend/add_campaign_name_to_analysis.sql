-- Add campaign_name column to analysis_results table
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(255);




