import { spawn } from 'child_process';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import https from 'https';
import http from 'http';

/**
 * CNIC OCR Service - Using EasyOCR for Pakistani National Identity Cards
 * 
 * Replaces Tesseract.js with EasyOCR (Python) for higher accuracy on Pakistani CNICs.
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
    this.pythonCommand =
      process.env.PYTHON_PATH ||
      process.env.PYTHON ||
      (process.platform === 'win32' ? 'python' : 'python3');
    this.ocrServiceUrl = process.env.OCR_SERVICE_URL?.replace(/\/+$/, '') || null;
    this.ocrServiceApiKey = process.env.OCR_SERVICE_API_KEY || null;
    this.ocrServiceTimeout = parseInt(process.env.OCR_SERVICE_TIMEOUT_MS || '180000', 10);
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

    return tempPath;
  }

  async cleanupTempFiles(files) {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file);

        }
      } catch (error) {

      }
    }
  }

  async runEasyOCR(frontPath, backPath = null) {
    return new Promise((resolve, reject) => {

      const args = [PYTHON_SCRIPT_PATH, frontPath];
      if (backPath) args.push(backPath);
      
      const pythonProcess = spawn(this.pythonCommand, args, {
        env: {
          ...process.env,
          EASYOCR_MODULE_PATH: process.env.EASYOCR_MODULE_PATH || path.join(process.cwd(), '.EasyOCR'),
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          OMP_NUM_THREADS: process.env.OCR_NUM_THREADS || '1',
          OPENBLAS_NUM_THREADS: process.env.OCR_NUM_THREADS || '1',
          MKL_NUM_THREADS: process.env.OCR_NUM_THREADS || '1',
          NUMEXPR_NUM_THREADS: process.env.OCR_NUM_THREADS || '1',
        },
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        pythonProcess.kill();
        reject(new Error('EasyOCR timeout (120s)'));
      }, 120000);

      pythonProcess.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (code !== 0 && !stdout.includes('{')) {
          const exitReason = signal ? `signal ${signal}` : `code ${code}`;
          console.error(`    Python exited with ${exitReason}`);
          if (stderr) console.error(`    Python stderr: ${stderr}`);
          return reject(new Error(`EasyOCR failed: Python exited with ${exitReason}${stderr ? `: ${stderr}` : ''}`));
        }
        
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON output');
          
          const result = JSON.parse(jsonMatch[0]);

          resolve(result);
        } catch (parseError) {
          console.error('    Parse error:', parseError.message);
          reject(parseError);
        }
      });
      
      pythonProcess.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (err.code === 'ENOENT') {
          reject(new Error('Python not found'));
        } else {
          reject(err);
        }
      });
    });
  }

  async runRemoteOCR(frontInput, backInput = null) {
    if (!this.ocrServiceUrl) {
      throw new Error('OCR_SERVICE_URL is not configured');
    }

    const payload = {};
    if (typeof frontInput === 'string' && frontInput.startsWith('http')) {
      payload.frontUrl = frontInput;
    } else if (Buffer.isBuffer(frontInput)) {
      payload.frontImageBase64 = frontInput.toString('base64');
    } else {
      throw new Error('Remote OCR requires a front image URL or buffer');
    }

    if (backInput) {
      if (typeof backInput === 'string' && backInput.startsWith('http')) {
        payload.backUrl = backInput;
      } else if (Buffer.isBuffer(backInput)) {
        payload.backImageBase64 = backInput.toString('base64');
      }
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.ocrServiceApiKey) {
      headers['x-ocr-service-key'] = this.ocrServiceApiKey;
    }

    const response = await axios.post(`${this.ocrServiceUrl}/ocr/cnic`, payload, {
      timeout: this.ocrServiceTimeout,
      headers,
    });

    return response.data;
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
      extractionMethod: 'easyocr',
      rawText: { front: '', back: '' },
      extractedAt: new Date(),
      errors: [],
    };

    const tempFiles = [];

    try {

      let ocrResult;

      if (this.ocrServiceUrl) {
        ocrResult = await this.runRemoteOCR(frontInput, backInput);
      } else {
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

          if (typeof backInput === 'string' && backInput.startsWith('http')) {
            backPath = await this.downloadImage(backInput);
          } else if (Buffer.isBuffer(backInput)) {
            backPath = await this.saveBufferToTemp(backInput);
          } else if (typeof backInput === 'string' && fs.existsSync(backInput)) {
            backPath = backInput;
          }
          if (backPath) tempFiles.push(backPath);
        }

        ocrResult = await this.runEasyOCR(frontPath, backPath);
      }

      if (ocrResult.success) {
        result.success = true;
        result.extractedCnicNumber = ocrResult.extractedCnicNumber;
        result.extractedName = ocrResult.extractedName;
        result.extractedFatherName = ocrResult.extractedFatherName;
        result.extractedGender = ocrResult.extractedGender;
        result.confidence = ocrResult.confidence || 0;
        result.extractionMethod = ocrResult.method || 'easyocr';
        
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

    return true;
  }

  async terminate() {

  }

  async checkEasyOCR() {
    if (this.ocrServiceUrl) {
      try {
        const response = await axios.get(`${this.ocrServiceUrl}/health`, {
          timeout: 10000,
        });
        return response.data?.status === 'ok';
      } catch {
        return false;
      }
    }

    return new Promise((resolve) => {
      const check = spawn(this.pythonCommand, ['-c', 'import easyocr, cv2, numpy; print("OK")']);
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
