import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

class OCRService {
  constructor() {
    this.worker = null;
  }

  async initialize() {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Silent progress
          }
        }
      });
      // Set only changeable parameters
      await this.worker.setParameters({
        tessedit_pageseg_mode: '6', // Uniform block of text
        tessedit_char_whitelist: '0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz/:.',
        preserve_interword_spaces: '1',
      });
    }
  }

  async preprocessImage(imagePath) {
    try {
      // Get image metadata first
      const metadata = await sharp(imagePath).metadata();
      console.log(`Original image size: ${metadata.width}x${metadata.height}`);
      
      // Only process if image is large enough
      if (metadata.width < 100 || metadata.height < 100) {
        console.log('Image too small, using original');
        return imagePath;
      }
      
      const preprocessedPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_ocr_enhanced.jpg');
      
      // Calculate target width (larger is better for OCR)
      const targetWidth = Math.max(1600, Math.min(2400, metadata.width * 2.5));
      
      // Very aggressive preprocessing to remove background patterns
      await sharp(imagePath)
        .resize(Math.floor(targetWidth), null, {
          fit: 'inside',
          withoutEnlargement: false,
          kernel: 'lanczos3'
        })
        .greyscale()
        // Remove color tints
        .normalise()
        // Increase contrast dramatically
        .linear(2.0, -(128 * 2.0) + 128)
        // Apply CLAHE for local contrast
        .clahe({
          width: 8,
          height: 8,
          maxSlope: 4
        })
        // Heavy sharpening for text
        .sharpen({ sigma: 3, m1: 1, m2: 2 })
        // Adjust gamma to brighten
        .gamma(2.0)
        // Binary threshold to remove backgrounds
        .threshold(140)
        // Median filter to remove noise
        .median(2)
        .toFile(preprocessedPath);
      
      // Verify processed image
      const processedMetadata = await sharp(preprocessedPath).metadata();
      console.log(`Processed image size: ${processedMetadata.width}x${processedMetadata.height}`);
      
      if (processedMetadata.width < 100 || processedMetadata.height < 100) {
        console.log('Processed image too small, using original');
        await fs.unlink(preprocessedPath).catch(() => {});
        return imagePath;
      }
      
      return preprocessedPath;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      // Return original path if preprocessing fails
      return imagePath;
    }
  }

  async extractTextFromImage(imagePath, isBackSide = false) {
    try {
      await this.initialize();
      
      // Preprocess image for better OCR results
      const preprocessedPath = await this.preprocessImage(imagePath);
      
      console.log(`Processing ${isBackSide ? 'BACK' : 'FRONT'} image: ${path.basename(preprocessedPath)}`);
      
      // Get full image OCR
      const result = await this.worker.recognize(preprocessedPath);
      const { text, confidence, words = [] } = result.data || {};
      
      console.log(`OCR confidence: ${confidence?.toFixed(2) || 0}%`);
      console.log(`Extracted text length: ${text?.length || 0} characters`);
      
      // Extract only digit sequences for CNIC detection
      const digitSequences = text.match(/\d+/g) || [];
      console.log('Digit sequences found:', digitSequences);
      
      // Try region-specific extraction for CNIC number area
      let regionText = '';
      try {
        const metadata = await sharp(preprocessedPath).metadata();
        const { width, height } = metadata;
        
        // Define region for CNIC number based on typical Pakistani CNIC card layout
        let extractRegion;
        if (isBackSide) {
          // Top-right corner for back side (where 13-digit CNIC number appears)
          extractRegion = {
            left: Math.floor(width * 0.55),
            top: Math.floor(height * 0.02),
            width: Math.floor(width * 0.43),
            height: Math.floor(height * 0.15)
          };
        } else {
          // Front side: CNIC number typically appears in right-center area
          // Adjust based on standard NADRA card layout
          extractRegion = {
            left: Math.floor(width * 0.35),
            top: Math.floor(height * 0.35),
            width: Math.floor(width * 0.60),
            height: Math.floor(height * 0.25)
          };
        }
        
        const regionImagePath = preprocessedPath.replace('.jpg', `_region_${isBackSide ? 'back' : 'front'}.jpg`);
        await sharp(preprocessedPath)
          .extract(extractRegion)
          .toFile(regionImagePath);
        
        console.log(`Extracting from region: ${JSON.stringify(extractRegion)}`);
        const regionResult = await this.worker.recognize(regionImagePath);
        regionText = regionResult.data.text || '';
        console.log('Region text:', regionText.substring(0, 100));
        
        // Clean up region image
        await fs.unlink(regionImagePath).catch(() => {});
      } catch (regionError) {
        console.log('Region extraction skipped:', regionError.message);
      }
      
      // Combine full text and region text
      const combinedText = `${text}\n${regionText}`;
      
      // Clean up preprocessed image if it's different from original
      if (preprocessedPath !== imagePath) {
        await fs.unlink(preprocessedPath).catch(() => {});
      }
      
      return { 
        text: combinedText || '', 
        confidence: confidence || 0, 
        words: words || [],
        digitSequences
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      return { text: '', confidence: 0, words: [], digitSequences: [] };
    }
  }

  parseCNICNumber(text, digitSequences = []) {
    console.log('=== CNIC Number Parsing ===');
    
    // Method 1: Look for 13 consecutive digits in the text (most reliable)
    const thirteenDigitPattern = /(\d{13})/g;
    const thirteenMatches = [...text.matchAll(thirteenDigitPattern)];
    
    if (thirteenMatches.length > 0) {
      for (const match of thirteenMatches) {
        const cnicDigits = match[1];
        // Validate first digit (Pakistani CNICs start with 1-6)
        if (['1', '2', '3', '4', '5', '6'].includes(cnicDigits[0])) {
          const formatted = `${cnicDigits.slice(0, 5)}-${cnicDigits.slice(5, 12)}-${cnicDigits.slice(12)}`;
          console.log('✓ Method 1: Found 13-digit CNIC:', formatted);
          return formatted;
        }
      }
    }
    
    // Method 2: Look for longer sequences first (filter noise)
    if (digitSequences && digitSequences.length > 0) {
      // Filter out single digits and very short sequences (likely noise)
      const longSequences = digitSequences
        .filter(seq => seq.length >= 5)
        .sort((a, b) => b.length - a.length); // Longest first
      
      console.log('Long digit sequences (5+ digits):', longSequences);
      
      // Check if any sequence is exactly 13 digits
      for (const seq of longSequences) {
        if (seq.length === 13 && ['1', '2', '3', '4', '5', '6'].includes(seq[0])) {
          const formatted = `${seq.slice(0, 5)}-${seq.slice(5, 12)}-${seq.slice(12)}`;
          console.log('✓ Method 2: Found CNIC in long sequences:', formatted);
          return formatted;
        }
      }
      
      // Try combining adjacent long sequences
      for (let i = 0; i < longSequences.length - 1; i++) {
        const combined = longSequences[i] + longSequences[i + 1];
        if (combined.length >= 13) {
          for (let j = 0; j <= combined.length - 13; j++) {
            const candidate = combined.slice(j, j + 13);
            if (['1', '2', '3', '4', '5', '6'].includes(candidate[0])) {
              const formatted = `${candidate.slice(0, 5)}-${candidate.slice(5, 12)}-${candidate.slice(12)}`;
              console.log('✓ Method 2b: Found CNIC from combined sequences:', formatted);
              return formatted;
            }
          }
        }
      }
    }
    
    // Method 3: Try formatted patterns (with hyphens or spaces)
    const formattedPatterns = [
      /(\d{5})[- ](\d{7})[- ](\d)/g,
      /(\d{5})\s*-\s*(\d{7})\s*-\s*(\d)/g,
    ];
    
    for (const pattern of formattedPatterns) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        const [_, part1, part2, part3] = matches[0];
        if (part1.length === 5 && part2.length === 7 && part3.length === 1 && 
            ['1', '2', '3', '4', '5', '6'].includes(part1[0])) {
          const formatted = `${part1}-${part2}-${part3}`;
          console.log('✓ Method 3: Found formatted CNIC:', formatted);
          return formatted;
        }
      }
    }
    
    // Method 4: Look for patterns like "Identity No" or "CNIC" followed by numbers
    const idPatterns = [
      /(?:Identity|ID|CNIC|Card)\s*(?:No|Number|#)?[:\s]*(\d{5})[- ]?(\d{7})[- ]?(\d)/gi,
      /(\d{5})[- ]?(\d{7})[- ]?(\d)\s*(?:Identity|ID|CNIC)/gi
    ];
    
    for (const pattern of idPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match.length >= 4) {
          const part1 = match[1];
          const part2 = match[2];
          const part3 = match[3];
          if (part1?.length === 5 && part2?.length === 7 && part3?.length === 1 &&
              ['1', '2', '3', '4', '5', '6'].includes(part1[0])) {
            const formatted = `${part1}-${part2}-${part3}`;
            console.log('✓ Method 4: Found CNIC near keyword:', formatted);
            return formatted;
          }
        }
      }
    }
    
    console.log('✗ No valid CNIC number found with reliable methods');
    return null;
  }

  parseDateOfBirth(text) {
    console.log('Looking for date of birth...');
    
    // Multiple date formats
    const datePatterns = [
      /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/g,  // DD/MM/YYYY or DD-MM-YYYY
      /\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/g,       // DD MM YYYY with spaces
      /DOB[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/gi, // DOB: DD/MM/YYYY
    ];
    
    for (const pattern of datePatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const [_, day, month, year] = match;
        const dayNum = parseInt(day, 10);
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);
        
        // Validate date components
        if (dayNum >= 1 && dayNum <= 31 && 
            monthNum >= 1 && monthNum <= 12 && 
            yearNum >= 1950 && yearNum <= 2010) {
          
          const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          if (!isNaN(date.getTime())) {
            console.log('Found date of birth:', date.toISOString().split('T')[0]);
            return date;
          }
        }
      }
    }
    
    console.log('No valid date of birth found');
    return null;
  }

  extractName(text, keyword = 'Name') {
    // Split text into lines for better name extraction
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    console.log('Looking for name with keyword:', keyword);
    
    // Multiple patterns to extract name
    const patterns = [
      new RegExp(`${keyword}[:\\s]+([A-Z][A-Za-z\\s]{2,50})`, 'i'),
      new RegExp(`${keyword}\\s*:\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)`, 'i'),
      new RegExp(`(?:^|\\n)${keyword}[:\\s]*\\n?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})`, 'i'),
    ];
    
    // Try patterns on full text
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let name = this.cleanNameText(match[1]);
        if (this.isValidName(name)) {
          console.log('Found name from pattern:', name);
          return name;
        }
      }
    }
    
    // Try line-by-line for name after keyword
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (new RegExp(keyword, 'i').test(line)) {
        // Check current line after keyword
        const afterKeyword = line.split(new RegExp(keyword + '[:\\s]*', 'i'))[1];
        if (afterKeyword) {
          let name = this.cleanNameText(afterKeyword);
          if (this.isValidName(name)) {
            console.log('Found name in same line:', name);
            return name;
          }
        }
        
        // Check next line
        if (i + 1 < lines.length) {
          let name = this.cleanNameText(lines[i + 1]);
          if (this.isValidName(name)) {
            console.log('Found name in next line:', name);
            return name;
          }
        }
      }
    }
    
    console.log('No valid name found');
    return null;
  }

  cleanNameText(text) {
    return text.trim()
      .replace(/\s+/g, ' ')
      .replace(/[^A-Za-z\s]/g, '')
      .replace(/\b(Name|Identity|Card|Number|Date|Birth|Issue|Expiry|National|Pakistan|CNIC|Muhammad|Ali)\b/gi, '')
      .trim();
  }

  isValidName(name) {
    // Name should be 3-50 chars, start with capital, contain only letters and spaces
    return name && 
           name.length >= 3 && 
           name.length <= 50 && 
           /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/i.test(name) &&
           name.split(' ').length >= 2; // At least first and last name
  }

  async extractCNICData(frontImagePath, backImagePath) {
    try {
      console.log('Starting OCR extraction for CNIC images...');
      
      // Validate image paths exist
      try {
        await fs.access(frontImagePath);
        await fs.access(backImagePath);
      } catch (error) {
        console.error('Image files not accessible:', error.message);
        return this.getEmptyResult('Image files not found');
      }
      
      // Extract text from both images with side-specific processing
      console.log('\n--- Processing FRONT image (main CNIC number location) ---');
      const frontResult = await this.extractTextFromImage(frontImagePath, false);
      
      console.log('\n--- Processing BACK image (top-right corner number) ---');
      const backResult = await this.extractTextFromImage(backImagePath, true);
      
      console.log('\nFront image confidence:', frontResult.confidence.toFixed(2) + '%');
      console.log('Back image confidence:', backResult.confidence.toFixed(2) + '%');
      
      // If both images have very low confidence, return early
      if (frontResult.confidence < 20 && backResult.confidence < 20) {
        console.log('OCR confidence too low for both images, skipping extraction');
        return this.getEmptyResult('OCR confidence too low');
      }
      
      const combinedText = `${frontResult.text}\n${backResult.text}`;
      
      // Only try parsing if we have some text
      if (!combinedText.trim()) {
        console.log('No text extracted from images');
        return this.getEmptyResult('No text extracted');
      }
      
      console.log('Combined text length:', combinedText.length);
      console.log('Front text preview:', frontResult.text.substring(0, 200));
      console.log('Back text preview:', backResult.text.substring(0, 200));
      
      // Parse CNIC data - try front first, then back, pass digit sequences
      console.log('\n=== Parsing CNIC Number from FRONT ===');
      let cnicNumber = this.parseCNICNumber(frontResult.text, frontResult.digitSequences);
      
      if (!cnicNumber) {
        console.log('\n=== Parsing CNIC Number from BACK (fallback) ===');
        cnicNumber = this.parseCNICNumber(backResult.text, backResult.digitSequences);
      }
      
      if (!cnicNumber) {
        console.log('\n=== Trying combined text ===');
        const combinedDigits = [...(frontResult.digitSequences || []), ...(backResult.digitSequences || [])];
        cnicNumber = this.parseCNICNumber(combinedText, combinedDigits);
      }
      
      console.log('\n=== Parsing Name ===');
      const name = this.extractName(frontResult.text, 'Name');
      
      console.log('\n=== Parsing Father Name ===');
      const fatherName = this.extractName(frontResult.text, "Father'?s? Name|Father Name|S\\/O");
      
      console.log('\n=== Parsing Date of Birth ===');
      const dateOfBirth = this.parseDateOfBirth(frontResult.text) || this.parseDateOfBirth(backResult.text);
      
      // Calculate average confidence
      const avgConfidence = (frontResult.confidence + backResult.confidence) / 2;
      
      console.log('Extracted CNIC data:', {
        cnicNumber: cnicNumber || 'Not found',
        name: name || 'Not found',
        fatherName: fatherName || 'Not found',
        dateOfBirth: dateOfBirth?.toISOString() || 'Not found',
        confidence: avgConfidence.toFixed(2) + '%'
      });
      
      return {
        cnicNumber,
        name,
        fatherName,
        dateOfBirth,
        rawText: {
          front: frontResult.text,
          back: backResult.text
        },
        confidence: avgConfidence,
        extractedAt: new Date()
      };
    } catch (error) {
      console.error('CNIC data extraction error:', error.message);
      console.error('Stack:', error.stack);
      return this.getEmptyResult(error.message);
    }
  }

  getEmptyResult(errorMessage) {
    return {
      cnicNumber: null,
      name: null,
      fatherName: null,
      dateOfBirth: null,
      rawText: { front: '', back: '' },
      confidence: 0,
      error: errorMessage
    };
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export default new OCRService();
