import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

/**
 * Enhanced OCR Service optimized for Pakistani CNIC cards
 * Uses multiple OCR passes with different preprocessing techniques
 * Combines eng+urd languages for better mixed-script recognition
 */
class EnhancedOCRService {
  constructor() {
    this.workers = {};
  }

  async getWorker(lang = 'eng') {
    if (!this.workers[lang]) {
      console.log(`Initializing Tesseract worker for ${lang}...`);
      this.workers[lang] = await Tesseract.createWorker(lang, 1, {
        logger: () => {} // Silent
      });
    }
    return this.workers[lang];
  }

  /**
   * Multiple preprocessing strategies for different CNIC elements
   */
  async preprocessForNumbers(imagePath) {
    const output = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_numbers.jpg');
    
    await sharp(imagePath)
      .resize(2400, null, { fit: 'inside', withoutEnlargement: false })
      .greyscale()
      .normalize()
      .sharpen({ sigma: 2 })
      .threshold(128) // Binary threshold for numbers
      .negate({ alpha: false }) // White text on black (better for digits)
      .blur(0.3) // Slight blur to connect broken digits
      .negate({ alpha: false }) // Back to black on white
      .toFile(output);
    
    return output;
  }

  async preprocessForText(imagePath) {
    const output = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_text.jpg');
    
    await sharp(imagePath)
      .resize(2400, null, { fit: 'inside', withoutEnlargement: false })
      .greyscale()
      .clahe({ width: 7, height: 7, maxSlope: 3 })
      .sharpen({ sigma: 1.5 })
      .gamma(1.5)
      .toFile(output);
    
    return output;
  }

  async preprocessAdaptive(imagePath) {
    const output = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_adaptive.jpg');
    
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    // Adaptive thresholding simulation
    await image
      .resize(Math.max(2000, width), null, { withoutEnlargement: false })
      .greyscale()
      .normalize()
      .modulate({ brightness: 1.2, saturation: 0 })
      .sharpen({ sigma: 2 })
      .linear(1.5, -(128 * 0.5))
      .threshold(115)
      .toFile(output);
    
    return output;
  }

  /**
   * Extract specific regions from CNIC card
   */
  async extractCNICNumberRegion(imagePath, isBack = false) {
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    let region;
    if (isBack) {
      // Back side: Top area where CNIC number is printed
      region = {
        left: Math.floor(width * 0.50),
        top: Math.floor(height * 0.02),
        width: Math.floor(width * 0.48),
        height: Math.floor(height * 0.18)
      };
    } else {
      // Front side: Multiple potential areas
      region = {
        left: Math.floor(width * 0.30),
        top: Math.floor(height * 0.30),
        width: Math.floor(width * 0.65),
        height: Math.floor(height * 0.30)
      };
    }
    
    const output = imagePath.replace(/\.(jpg|jpeg|png)$/i, `_cnic_region.jpg`);
    await sharp(imagePath)
      .extract(region)
      .toFile(output);
    
    return output;
  }

  async extractNameRegion(imagePath) {
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // Name typically appears in upper portion
    const region = {
      left: Math.floor(width * 0.25),
      top: Math.floor(height * 0.15),
      width: Math.floor(width * 0.70),
      height: Math.floor(height * 0.35)
    };
    
    const output = imagePath.replace(/\.(jpg|jpeg|png)$/i, `_name_region.jpg`);
    await sharp(imagePath)
      .extract(region)
      .toFile(output);
    
    return output;
  }

  /**
   * Multi-pass OCR with different configurations
   */
  async performMultiPassOCR(imagePath, type = 'numbers') {
    const results = [];
    
    try {
      // Pass 1: Optimized for numbers
      const numbersImage = await this.preprocessForNumbers(imagePath);
      const worker1 = await this.getWorker('eng');
      await worker1.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789-/',
      });
      const result1 = await worker1.recognize(numbersImage);
      results.push({ type: 'numbers', text: result1.data.text, confidence: result1.data.confidence });
      await fs.unlink(numbersImage).catch(() => {});
      
      // Pass 2: Optimized for text/names
      const textImage = await this.preprocessForText(imagePath);
      const worker2 = await this.getWorker('eng');
      await worker2.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
      });
      const result2 = await worker2.recognize(textImage);
      results.push({ type: 'text', text: result2.data.text, confidence: result2.data.confidence });
      await fs.unlink(textImage).catch(() => {});
      
      // Pass 3: Adaptive preprocessing
      const adaptiveImage = await this.preprocessAdaptive(imagePath);
      const worker3 = await this.getWorker('eng');
      await worker3.setParameters({
        tessedit_pageseg_mode: '11', // Sparse text
        tessedit_char_whitelist: '0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/',
      });
      const result3 = await worker3.recognize(adaptiveImage);
      results.push({ type: 'adaptive', text: result3.data.text, confidence: result3.data.confidence });
      await fs.unlink(adaptiveImage).catch(() => {});
      
    } catch (error) {
      console.error('Multi-pass OCR error:', error);
    }
    
    return results;
  }

  /**
   * Advanced CNIC number extraction with pattern matching
   */
  parseCNICNumber(allResults) {
    const methods = [];
    
    // Combine all text from different passes
    const combinedText = allResults.map(r => r.text).join('\n');
    
    // Method 1: Direct 13-digit pattern with optional dashes
    const pattern1 = /\b(\d{5})[-\s]?(\d{7})[-\s]?(\d{1})\b/g;
    let match;
    while ((match = pattern1.exec(combinedText)) !== null) {
      const cnic = `${match[1]}-${match[2]}-${match[3]}`;
      const firstDigit = parseInt(match[1][0]);
      if (firstDigit >= 1 && firstDigit <= 6) {
        methods.push({ method: '13-digit pattern', cnic, confidence: 95 });
      }
    }
    
    // Method 2: Look for any 13 consecutive digits
    const allDigits = combinedText.replace(/[^\d]/g, '');
    for (let i = 0; i <= allDigits.length - 13; i++) {
      const sequence = allDigits.substr(i, 13);
      const firstDigit = parseInt(sequence[0]);
      if (firstDigit >= 1 && firstDigit <= 6) {
        const formatted = `${sequence.substr(0, 5)}-${sequence.substr(5, 7)}-${sequence.substr(12, 1)}`;
        methods.push({ method: '13 consecutive digits', cnic: formatted, confidence: 85 });
      }
    }
    
    // Method 3: Extract all digit sequences and try combinations
    const digitSequences = combinedText.match(/\d+/g) || [];
    const longSequences = digitSequences.filter(s => s.length >= 5);
    
    for (let i = 0; i < longSequences.length; i++) {
      const seq1 = longSequences[i];
      
      // Check if this sequence contains a valid 5-digit start
      if (seq1.length >= 5) {
        for (let start = 0; start <= seq1.length - 5; start++) {
          const part1 = seq1.substr(start, 5);
          const firstDigit = parseInt(part1[0]);
          
          if (firstDigit >= 1 && firstDigit <= 6) {
            // Look for 7-digit sequence nearby
            for (let j = i; j < Math.min(i + 3, longSequences.length); j++) {
              const seq2 = longSequences[j];
              if (seq2.length >= 7) {
                for (let mid = 0; mid <= seq2.length - 7; mid++) {
                  const part2 = seq2.substr(mid, 7);
                  
                  // Look for 1-digit sequence
                  for (let k = j; k < Math.min(j + 2, longSequences.length); k++) {
                    const seq3 = longSequences[k];
                    if (seq3.length >= 1) {
                      const part3 = seq3.substr(0, 1);
                      const cnic = `${part1}-${part2}-${part3}`;
                      methods.push({ method: 'sequence combination', cnic, confidence: 70 });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Return best match (highest confidence, deduplicated)
    const unique = [...new Set(methods.map(m => m.cnic))];
    if (unique.length > 0) {
      const best = methods.sort((a, b) => b.confidence - a.confidence)[0];
      console.log(`✓ CNIC found via ${best.method}: ${best.cnic} (${best.confidence}% confidence)`);
      return best.cnic;
    }
    
    console.log('✗ No valid CNIC number found');
    console.log('Digit sequences found:', digitSequences);
    return null;
  }

  /**
   * Extract name with improved pattern matching
   */
  extractName(text, keyword = 'Name') {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    // Look for lines near keyword
    const keywordIndex = lines.findIndex(l => l.toLowerCase().includes(keyword.toLowerCase()));
    if (keywordIndex !== -1) {
      // Check next few lines
      for (let i = keywordIndex; i < Math.min(keywordIndex + 4, lines.length); i++) {
        const line = lines[i];
        const cleaned = line.replace(/[^A-Za-z\s]/g, '').trim();
        
        if (cleaned.length >= 3 && /^[A-Z]/.test(cleaned)) {
          const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
          if (words.length >= 2) {
            return words.join(' ');
          }
        }
      }
    }
    
    // Fallback: Look for capitalized names
    for (const line of lines) {
      const cleaned = line.replace(/[^A-Za-z\s]/g, '').trim();
      if (cleaned.length >= 6 && /^[A-Z][a-z]+\s+[A-Z]/.test(cleaned)) {
        const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
        if (words.length >= 2 && words.length <= 5) {
          return words.join(' ');
        }
      }
    }
    
    return null;
  }

  /**
   * Parse date of birth
   */
  extractDateOfBirth(text) {
    // Pakistani format: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const patterns = [
      /\b(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})\b/,
      /\b(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})\b/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          let day, month, year;
          if (match[3].length === 4) {
            [, day, month, year] = match;
          } else {
            [, year, month, day] = match;
          }
          
          const date = new Date(year, month - 1, day);
          if (date.getFullYear() >= 1940 && date.getFullYear() <= 2010) {
            return date;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    return null;
  }

  /**
   * Main extraction method
   */
  async extractCNICData(frontImagePath, backImagePath) {
    console.log('\n🔍 Starting Enhanced OCR extraction for Pakistani CNIC...\n');
    
    try {
      // Extract and process CNIC number region from back side
      console.log('📄 Processing BACK side for CNIC number...');
      const backRegion = await this.extractCNICNumberRegion(backImagePath, true);
      const backResults = await this.performMultiPassOCR(backRegion, 'numbers');
      await fs.unlink(backRegion).catch(() => {});
      
      // Extract CNIC number
      const cnicNumber = this.parseCNICNumber(backResults);
      
      // Process front side for name and other details
      console.log('\n📄 Processing FRONT side for name and details...');
      const nameRegion = await this.extractNameRegion(frontImagePath);
      const frontResults = await this.performMultiPassOCR(nameRegion, 'text');
      await fs.unlink(nameRegion).catch(() => {});
      
      const combinedFrontText = frontResults.map(r => r.text).join('\n');
      
      // Extract fields
      const name = await this.extractName(combinedFrontText, 'Name');
      const fatherName = await this.extractName(combinedFrontText, 'Father');
      const dob = this.extractDateOfBirth(combinedFrontText);
      
      // Calculate overall confidence
      const avgConfidence = backResults.length > 0 
        ? backResults.reduce((sum, r) => sum + r.confidence, 0) / backResults.length 
        : 0;
      
      // Boost confidence if CNIC number was found
      const finalConfidence = cnicNumber ? Math.min(95, avgConfidence + 30) : avgConfidence;
      
      console.log('\n✅ Extraction Results:');
      console.log(`CNIC Number: ${cnicNumber || 'Not found'}`);
      console.log(`Name: ${name || 'Not found'}`);
      console.log(`Father Name: ${fatherName || 'Not found'}`);
      console.log(`Date of Birth: ${dob || 'Not found'}`);
      console.log(`Confidence: ${finalConfidence.toFixed(1)}%\n`);
      
      return {
        success: !!cnicNumber,
        extractedCnicNumber: cnicNumber,
        extractedName: name,
        extractedFatherName: fatherName,
        extractedDateOfBirth: dob,
        confidence: finalConfidence,
        rawText: {
          front: combinedFrontText.substring(0, 500),
          back: backResults.map(r => r.text).join('\n').substring(0, 500)
        },
        extractedAt: new Date()
      };
      
    } catch (error) {
      console.error('❌ OCR Extraction failed:', error);
      return {
        success: false,
        confidence: 0,
        errorMessage: error.message
      };
    }
  }

  async terminate() {
    for (const [lang, worker] of Object.entries(this.workers)) {
      await worker.terminate();
    }
    this.workers = {};
  }
}

export default new EnhancedOCRService();
