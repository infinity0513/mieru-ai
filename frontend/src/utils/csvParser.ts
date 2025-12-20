import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { CampaignData } from '../types';

// Required CSV Headers mapping (flexible matching)
const HEADER_MAPPING: { [key: string]: string } = {
  '日付': 'date',
  'Date': 'date',
  'キャンペーン名': 'campaign_name',
  'Campaign name': 'campaign_name',
  'Campaign Name': 'campaign_name',
  'インプレッション': 'impressions',
  'Impressions': 'impressions',
  'クリック': 'clicks',
  'Clicks': 'clicks',
  '消化金額': 'cost',
  'Cost': 'cost',
  'Amount spent': 'cost',
  'コンバージョン': 'conversions',
  'Conversions': 'conversions',
  'Results': 'conversions',
  'コンバージョン値': 'conversion_value',
  'Conversion value': 'conversion_value'
};

const processData = (data: any[]): CampaignData[] => {
  if (!data || data.length === 0) {
    throw new Error("データが見つかりません");
  }

  // Check for minimal required columns in the first row
  const firstRow = data[0] as any;
  const headers = Object.keys(firstRow);

  const processedData: CampaignData[] = data.map((row: any, index) => {
    const getValue = (keys: string[]): string | number => {
      for (const key of keys) {
        if (row[key] !== undefined) return row[key];
      }
      for (const key of keys) {
         const match = headers.find(h => h.includes(key));
         if(match && row[match] !== undefined) return row[match];
      }
      return 0;
    };

    let dateStr = getValue(['日付', 'Date', 'Reporting starts']) as string;
    
    // Normalize Date to YYYY-MM-DD
    try {
      if (dateStr) {
        // Handle Excel numeric dates (if coming from SheetJS)
        if (typeof dateStr === 'number') {
            const dateObj = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
            dateStr = dateObj.toISOString().split('T')[0];
        } else {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                dateStr = d.toISOString().split('T')[0];
            } else {
                dateStr = new Date().toISOString().split('T')[0];
            }
        }
      } else {
        dateStr = new Date().toISOString().split('T')[0];
      }
    } catch (e) {
      dateStr = new Date().toISOString().split('T')[0];
    }

    const campaignName = getValue(['キャンペーン名', 'Campaign name', 'Campaign Name']) as string || `Unknown Campaign ${index}`;
    
    const cleanNum = (val: any) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      return parseFloat(val.toString().replace(/,/g, '').replace(/¥/g, '').replace(/\$/g, '')) || 0;
    };

    const impressions = cleanNum(getValue(['インプレッション', 'Impressions']));
    const clicks = cleanNum(getValue(['クリック', 'Clicks', 'Link clicks']));
    const cost = cleanNum(getValue(['消化金額', 'Cost', 'Amount spent', 'Amount Spent']));
    const conversions = cleanNum(getValue(['コンバージョン', 'Conversions', 'Results', 'Purchases']));
    const conversion_value = cleanNum(getValue(['コンバージョン値', 'Conversion value', 'Purchase value']));

    // Calculated fields
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const cpa = conversions > 0 ? cost / conversions : 0;
    const roas = cost > 0 ? (conversion_value / cost) * 100 : 0;

    return {
      id: `row_${index}_${Date.now()}`,
      date: dateStr,
      campaign_name: campaignName,
      impressions,
      clicks,
      cost,
      conversions,
      conversion_value,
      ctr,
      cpc,
      cpa,
      roas
    };
  });

  // Sort by date desc
  processedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return processedData;
};

export const parseFile = (file: File): Promise<CampaignData[]> => {
  return new Promise((resolve, reject) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          const processed = processData(jsonData);
          resolve(processed);
        } catch (error) {
          reject(new Error("Excelファイルの読み込みに失敗しました"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    } else {
      // CSV Fallback
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const processed = processData(results.data);
            resolve(processed);
          } catch (err) {
            reject(err);
          }
        },
        error: (error) => reject(error)
      });
    }
  });
};
// Backward compatibility alias
export const parseCSV = parseFile;