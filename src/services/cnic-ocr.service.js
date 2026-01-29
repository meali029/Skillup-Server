import { spawn } from 'child_process';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import http from 'http';

/**
 * CNIC OCR Service - Using PaddleOCR for Pakistani National Identity Cards
 * 
 * Replaces Tesseract.js with PaddleOCR (Python) for ~95% accuracy on Pakistani CNICs.
 */

const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;
const VALID_FIRST_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const CONFIDENCE_THRESHOLD = 60;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PYTHON_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'paddle_ocr.py');

const CNIC_REGIONS = {
  IDENTITY_NUMBER: { x: 0.04, y: 0.54, width: 0.42, height: 0.16, description: 'Identity Number region on front' },
  DATE_OF_BIRTH: { x: 0.52, y: 0.54, width: 0.30, height: 0.16, description: 'Date of Birth region' },
  NAME: { x: 0.15, y: 0.06, width: 0.55, height: 0.14, description: 'Name region (English)' },
  FATHER_NAME: { x: 0.15, y: 0.20, width: 0.55, height: 0.12, description: 'Father Name region (English)' },
};

class CNICOCRService {
  constructor() {
    this.pythonCommand = 'C:\\Users\\Mehboob Ali\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
    this.tempDir = os.tmpdir();
  }

  async downloadImage(url) {
    const tempPath = path.join(this.tempDir, `cnic_${uuidv4()}.jpg`);
    
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(tempPath);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(tempPath);
          return this.downloadImage(response.headers.location).then(resolve).catch(reject);
        }
        
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tempPath);
          return reject(new Error(`Failed to download: ${response.statusCode}`));
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`    Downloaded to: ${tempPath}`);
          resolve(tempPath);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(tempPath, () => {});
        reject(err);
      });
    });
  }

  async saveBufferToTemp(buffer) {
    const tempPath = path.join(this.tempDir, `cnic_${uuidv4()}.jpg`);
    const optimized = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
    await fs.promises.writeFile(tempPath, optimized);
    console.log(`    Saved to: ${tempPath}`);
    return tempPath;
  }

  async cleanupTempFiles(files) {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file);
          console.log(`    Cleaned: ${file}`);
        }
      } catch (error) {
        console.warn(`    Cleanup failed: ${file}`, error.message);
      }
    }
  }

  async runPaddleOCR(frontPath, backPath = null) {
    return new Promise((resolve, reject) => {
      console.log('    Running PaddleOCR...');
      console.log(`      Front: ${frontPath}`);
      if (backPath) console.log(`      Back: ${backPath}`);
      
      const args = [PYTHON_SCRIPT_PATH, frontPath];
      if (backPath) args.push(backPath);
      
      const pythonProcess = spawn(this.pythonCommand, args, {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        data.toString().split('\n').filter(l => l.trim()).forEach(line => 
          console.log(`   [Python] ${line}`)
        );
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0 && !stdout.includes('{')) {
          console.error(`    Python exited: ${code}`);
          return reject(new Error(`PaddleOCR failed: ${stderr}`));
        }
        
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON output');
          
          const result = JSON.parse(jsonMatch[0]);
          console.log('    PaddleOCR completed');
          resolve(result);
        } catch (parseError) {
          console.error('    Parse error:', parseError.message);
          reject(parseError);
        }
      });
      
      pythonProcess.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Python not found'));
        } else {
          reject(err);
        }
      });
      
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('PaddleOCR timeout (120s)'));
      }, 120000);
    });
  }

  validateCNIC(cnic) {
    if (!cnic || !CNIC_REGEX.test(cnic)) return false;
    return VALID_FIRST_DIGITS.includes(cnic[0]);
  }

  formatAsCNIC(digits) {
    if (!digits || digits.length !== 13) return null;
    const cleaned = digits.replace(/\D/g, '');
    if (cleaned.length !== 13) return null;
    return `${cleaned.substring(0, 5)}-${cleaned.substring(5, 12)}-${cleaned.substring(12)}`;
  }

  async extractCNICData(frontInput, backInput = null) {
    console.log('\n' + ''.repeat(60));
    console.log(' CNIC OCR EXTRACTION - PaddleOCR Engine');
    console.log(''.repeat(60));

    const result = {
      success: false,
      extractedCnicNumber: null,
      extractedName: null,
      extractedFatherName: null,
      extractedDateOfBirth: null,
      extractedDateOfIssue: null,
      extractedDateOfExpiry: null,
      extractedGender: null,
      confidence: 0,
      isLowConfidence: true,
      extractionMethod: 'paddleocr',
      rawText: { front: '', back: '' },
      extractedAt: new Date(),
      errors: [],
    };

    const tempFiles = [];

    try {
      console.log('\n STEP 1: Preparing front image...');
      let frontPath;
      
      if (typeof frontInput === 'string' && frontInput.startsWith('http')) {
        frontPath = await this.downloadImage(frontInput);
      } else if (Buffer.isBuffer(frontInput)) {
        frontPath = await this.saveBufferToTemp(frontInput);
      } else if (typeof frontInput === 'string' && fs.existsSync(frontInput)) {
        frontPath = frontInput;
      } else {
        throw new Error('Invalid front image');
      }
      tempFiles.push(frontPath);

      let backPath = null;
      if (backInput) {
        console.log('\n STEP 2: Preparing back image...');
        if (typeof backInput === 'string' && backInput.startsWith('http')) {
          backPath = await this.downloadImage(backInput);
        } else if (Buffer.isBuffer(backInput)) {
          backPath = await this.saveBufferToTemp(backInput);
        } else if (typeof backInput === 'string' && fs.existsSync(backInput)) {
          backPath = backInput;
        }
        if (backPath) tempFiles.push(backPath);
      }

      console.log('\n STEP 3: Running PaddleOCR...');
      const ocrResult = await this.runPaddleOCR(frontPath, backPath);

      console.log('\n STEP 4: Processing results...');
      
      if (ocrResult.success) {
        result.success = true;
        result.extractedCnicNumber = ocrResult.extractedCnicNumber;
        result.extractedName = ocrResult.extractedName;
        result.extractedFatherName = ocrResult.extractedFatherName;
        result.extractedGender = ocrResult.extractedGender;
        result.confidence = ocrResult.confidence || 0;
        result.extractionMethod = ocrResult.method || 'paddleocr';
        
        if (ocrResult.extractedDateOfBirth) {
          result.extractedDateOfBirth = this.parseDate(ocrResult.extractedDateOfBirth);
        }
        if (ocrResult.extractedDateOfIssue) {
          result.extractedDateOfIssue = this.parseDate(ocrResult.extractedDateOfIssue);
        }
        if (ocrResult.extractedDateOfExpiry) {
          result.extractedDateOfExpiry = this.parseDate(ocrResult.extractedDateOfExpiry);
        }
        
        if (result.extractedCnicNumber && !this.validateCNIC(result.extractedCnicNumber)) {
          console.log(`    CNIC validation failed: ${result.extractedCnicNumber}`);
          result.errors.push('CNIC validation failed');
          result.confidence = Math.min(result.confidence, 50);
        }
      } else {
        result.errors.push(ocrResult.error || 'OCR failed');
      }

      if (ocrResult.errors?.length > 0) {
        result.errors.push(...ocrResult.errors);
      }

      result.isLowConfidence = result.confidence < CONFIDENCE_THRESHOLD;

      console.log('\n' + ''.repeat(60));
      console.log(' EXTRACTION RESULTS:');
      console.log(''.repeat(60));
      console.log(`   CNIC:       ${result.extractedCnicNumber || 'Not found'}`);
      console.log(`   Confidence: ${result.confidence.toFixed(1)}% ${result.isLowConfidence ? '(LOW)' : '(GOOD)'}`);
      console.log(`   Method:     ${result.extractionMethod}`);
      console.log(`   Name:       ${result.extractedName || 'N/A'}`);
      console.log(`   Father:     ${result.extractedFatherName || 'N/A'}`);
      console.log(`   DOB:        ${result.extractedDateOfBirth?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`   Gender:     ${result.extractedGender || 'N/A'}`);
      console.log(''.repeat(60) + '\n');

    } catch (error) {
      console.error(' OCR failed:', error.message);
      result.errors.push(`Error: ${error.message}`);
    } finally {
      await this.cleanupTempFiles(tempFiles);
    }

    return result;
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    
    const patterns = [
      /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/,
      /(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/,
    ];
    
    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        let day, month, year;
        if (match[1].length === 4) {
          [, year, month, day] = match;
        } else {
          [, day, month, year] = match;
        }
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) return date;
      }
    }
    return null;
  }

  async initialize() {
    console.log('ℹ PaddleOCR initializes on first use');
    return true;
  }

  async terminate() {
    console.log('ℹ PaddleOCR terminates after each call');
  }

  async checkPaddleOCR() {
    return new Promise((resolve) => {
      const check = spawn(this.pythonCommand, ['-c', 'import paddleocr; print("OK")']);
      let output = '';
      check.stdout.on('data', (d) => { output += d.toString(); });
      check.on('close', (code) => resolve(code === 0 && output.includes('OK')));
      check.on('error', () => resolve(false));
      setTimeout(() => { check.kill(); resolve(false); }, 10000);
    });
  }
}

const cnicOCRService = new CNICOCRService();
export default cnicOCRService;
export { CNICOCRService, CNIC_REGIONS, CONFIDENCE_THRESHOLD };
