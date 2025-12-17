import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs/promises';

/**
 * Template-based OCR service specifically for Pakistani CNIC cards
 * Uses fixed template regions since all CNICs follow the same layout
 */
class CNICTemplateOCR {
  constructor() {
    this.worker = null;
  }

  /**
   * CNIC Template Regions (relative coordinates)
   * Based on standard NADRA CNIC card layout
   */
  static REGIONS = {
    // Front side regions
    CNIC_NUMBER_FRONT: {
      x: 0.12,      // 12% from left
      y: 0.52,      // 52% from top
      width: 0.50,  // 50% of card width
      height: 0.12  // 12% of card height
    },
    NAME: {
      x: 0.38,
      y: 0.27,
      width: 0.58,
      height: 0.08
    },
    FATHER_NAME: {
      x: 0.38,
      y: 0.38,
      width: 0.58,
      height: 0.08
    },
    DOB: {
      x: 0.38,
      y: 0.46,
      width: 0.30,
      height: 0.06
    },
    // Back side region
    CNIC_NUMBER_BACK: {
      x: 0.60,      // Top-right corner
      y: 0.02,
      width: 0.38,
      height: 0.10
    }
  };

  async getWorker() {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: () => {} // Silent
      });
    }
    return this.worker;
  }

  /**
   * Extract specific region from card image
   */
  async extractRegion(imagePath, region) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const { width, height } = metadata;

      const extractBox = {
        left: Math.floor(width * region.x),
        top: Math.floor(height * region.y),
        width: Math.floor(width * region.width),
        height: Math.floor(height * region.height)
      };

      const outputPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, `_region_${Date.now()}.jpg`);

      // Extract and upscale region for better OCR
      await sharp(imagePath)
        .extract(extractBox)
        .resize(1200, null, { 
          fit: 'inside',
          kernel: 'lanczos3',
          withoutEnlargement: false
        })
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.error('Region extraction error:', error);
      return imagePath; // Fallback to original
    }
  }

  /**
   * Multiple preprocessing strategies for different image conditions
   */
  async preprocessForCNICNumber(imagePath, strategy = 'balanced') {
    try {
      const outputPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, `_${strategy}.jpg`);
      const metadata = await sharp(imagePath).metadata();
      
      console.log(`  Processing (${strategy}): ${metadata.width}x${metadata.height}px`);

      if (metadata.width < 50 || metadata.height < 50) {
        console.log('  ⚠️ Region too small');
        return imagePath;
      }

      const image = sharp(imagePath).resize(2000, null, { 
        fit: 'inside', 
        withoutEnlargement: false,
        kernel: 'lanczos3'
      });

      // Different preprocessing strategies
      if (strategy === 'high_contrast') {
        // For images with hologram/background noise
        await image
          .greyscale()
          .normalize()
          .linear(2.5, -(128 * 2.5) + 128) // Very high contrast
          .threshold(130) // Binary threshold
          .negate() // Try inverted
          .toFile(outputPath);
      } else if (strategy === 'clean') {
        // For already clear images
        await image
          .greyscale()
          .normalize()
          .sharpen({ sigma: 2 })
          .toFile(outputPath);
      } else {
        // Balanced approach (default)
        await image
          .greyscale()
          .normalize()
          .sharpen({ sigma: 1.5 })
          .linear(1.3, -(128 * 0.3))
          .toFile(outputPath);
      }

      return outputPath;
    } catch (error) {
      console.error('  Preprocessing error:', error.message);
      return imagePath;
    }
  }

  /**
   * Extract CNIC number with multiple strategies
   */
  async extractCNICNumberFromRegion(regionPath, useFullImage = false) {
    try {
      const worker = await this.getWorker();
      const strategies = useFullImage ? 
        ['balanced', 'high_contrast', 'clean'] : 
        ['balanced'];

      let bestResult = { text: '', confidence: 0, strategy: null };

      for (const strategy of strategies) {
        const preprocessed = await this.preprocessForCNICNumber(regionPath, strategy);

        // Try multiple PSM modes
        const psmModes = [
          { mode: '6', name: 'Block' },
          { mode: '7', name: 'Line' },
          { mode: '11', name: 'Sparse' }
        ];

        for (const psm of psmModes) {
          try {
            await worker.setParameters({
              tessedit_pageseg_mode: psm.mode,
              tessedit_char_whitelist: '0123456789-/',
            });

            const result = await worker.recognize(preprocessed);
            const text = result.data.text.trim();
            const conf = result.data.confidence;

            if (text && conf > 0) {
              console.log(`  ${strategy} PSM ${psm.mode}: "${text.substring(0, 30)}" (${conf.toFixed(1)}%)`);
            }

            if (conf > bestResult.confidence) {
              bestResult = {
                text: result.data.text,
                confidence: conf,
                strategy: `${strategy}_${psm.mode}`
              };
            }
          } catch (e) {
            // Silent - try next
          }
        }

        await fs.unlink(preprocessed).catch(() => {});
      }
      
      await fs.unlink(regionPath).catch(() => {});
      return bestResult;
    } catch (error) {
      console.error('  OCR error:', error.message);
      return { text: '', confidence: 0, strategy: null };
    }
  }

  /**
   * Parse and validate CNIC number with multiple strategies
   */
  parseCNICNumber(text) {
    if (!text) return null;

    console.log(`  Parsing: "${text}"`);

    // Strategy 1: Already formatted CNIC (XXXXX-XXXXXXX-X)
    const formatted = text.match(/(\d{5})[-\s]?(\d{7})[-\s]?(\d{1})/);
    if (formatted) {
      const cnic = `${formatted[1]}-${formatted[2]}-${formatted[3]}`;
      const firstDigit = parseInt(formatted[1][0]);
      if (firstDigit >= 1 && firstDigit <= 6) {
        console.log(`  ✓ Found formatted CNIC: ${cnic}`);
        return cnic;
      }
    }

    // Strategy 2: Remove all non-digits and check length
    const digits = text.replace(/[^0-9]/g, '');
    console.log(`  Extracted digits: ${digits} (${digits.length} digits)`);

    if (digits.length === 13) {
      const firstDigit = parseInt(digits[0]);
      if (firstDigit >= 1 && firstDigit <= 6) {
        const cnic = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
        console.log(`  ✓ Valid 13-digit CNIC: ${cnic}`);
        return cnic;
      }
    }

    // Strategy 3: Find longest digit sequence and check if it's 13 digits
    const sequences = text.match(/\d+/g) || [];
    const longest = sequences.sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length === 13) {
      const firstDigit = parseInt(longest[0]);
      if (firstDigit >= 1 && firstDigit <= 6) {
        const cnic = `${longest.slice(0, 5)}-${longest.slice(5, 12)}-${longest.slice(12)}`;
        console.log(`  ✓ Found 13-digit sequence: ${cnic}`);
        return cnic;
      }
    }

    console.log(`  ✗ No valid CNIC found in text`);
    return null;
  }

  /**
   * Extract name from region
   */
  async extractName(imagePath, region) {
    try {
      const regionPath = await this.extractRegion(imagePath, region);
      const worker = await this.getWorker();

      await worker.setParameters({
        tessedit_pageseg_mode: '7',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '
      });

      const result = await worker.recognize(regionPath);
      await fs.unlink(regionPath).catch(() => {});

      // Clean and validate name
      const name = result.data.text
        .replace(/[^A-Za-z\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');

      const words = name.split(' ').filter(w => w.length >= 2);
      return words.length >= 2 ? words.join(' ') : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Main extraction method - Template-based approach
   */
  async extractCNICData(frontImagePath, backImagePath) {
    console.log('\n🔍 Template-based CNIC OCR extraction...\n');

    try {
      const results = {
        cnicNumber: null,
        name: null,
        fatherName: null,
        dateOfBirth: null,
        confidence: 0,
        method: null
      };

      // Initialize result variables
      let backResult = { text: '', confidence: 0 };
      let frontResult = { text: '', confidence: 0 };

      // Strategy 1: Extract from BACK side (most reliable - top right corner)
      console.log('📄 Extracting CNIC number from BACK side (top-right region)...');
      const backRegion = await this.extractRegion(
        backImagePath,
        CNICTemplateOCR.REGIONS.CNIC_NUMBER_BACK
      );
      backResult = await this.extractCNICNumberFromRegion(backRegion);
      const cnicFromBack = this.parseCNICNumber(backResult.text);

      if (cnicFromBack) {
        results.cnicNumber = cnicFromBack;
        results.confidence = backResult.confidence;
        results.method = 'back_side_template';
        console.log(`✓ CNIC found from BACK: ${cnicFromBack} (${backResult.confidence.toFixed(1)}%)`);
      }

      // Strategy 2: If back side failed, try FRONT side region
      if (!results.cnicNumber) {
        console.log('📄 Trying FRONT side (center-bottom region)...');
        const frontRegion = await this.extractRegion(
          frontImagePath,
          CNICTemplateOCR.REGIONS.CNIC_NUMBER_FRONT
        );
        frontResult = await this.extractCNICNumberFromRegion(frontRegion);
        const cnicFromFront = this.parseCNICNumber(frontResult.text);

        if (cnicFromFront) {
          results.cnicNumber = cnicFromFront;
          results.confidence = frontResult.confidence;
          results.method = 'front_side_template';
          console.log(`✓ CNIC found from FRONT: ${cnicFromFront} (${frontResult.confidence.toFixed(1)}%)`);
        }
      }

      // Strategy 3: Fallback - Process full BACK image with all strategies
      if (!results.cnicNumber) {
        console.log('📄 Fallback: Processing full BACK image...');
        const fullBackResult = await this.extractCNICNumberFromRegion(backImagePath, true);
        const cnicFromFullBack = this.parseCNICNumber(fullBackResult.text);
        
        if (cnicFromFullBack) {
          results.cnicNumber = cnicFromFullBack;
          results.confidence = fullBackResult.confidence;
          results.method = 'full_back_image';
          console.log(`✓ CNIC found from FULL BACK: ${cnicFromFullBack} (${fullBackResult.confidence.toFixed(1)}%)`);
          backResult = fullBackResult; // Update for rawText
        }
      }

      // Strategy 4: Last resort - Process full FRONT image
      if (!results.cnicNumber) {
        console.log('📄 Last resort: Processing full FRONT image...');
        const fullFrontResult = await this.extractCNICNumberFromRegion(frontImagePath, true);
        const cnicFromFullFront = this.parseCNICNumber(fullFrontResult.text);
        
        if (cnicFromFullFront) {
          results.cnicNumber = cnicFromFullFront;
          results.confidence = fullFrontResult.confidence;
          results.method = 'full_front_image';
          console.log(`✓ CNIC found from FULL FRONT: ${cnicFromFullFront} (${fullFrontResult.confidence.toFixed(1)}%)`);
          frontResult = fullFrontResult;
        }
      }

      // Extract name (optional - lower priority)
      if (results.cnicNumber) {
        console.log('📝 Extracting name...');
        results.name = await this.extractName(frontImagePath, CNICTemplateOCR.REGIONS.NAME);
        if (results.name) {
          console.log(`✓ Name: ${results.name}`);
        }

        // Extract father's name (optional)
        console.log('📝 Extracting father\'s name...');
        results.fatherName = await this.extractName(frontImagePath, CNICTemplateOCR.REGIONS.FATHER_NAME);
        if (results.fatherName) {
          console.log(`✓ Father\'s Name: ${results.fatherName}`);
        }
      }

      // Calculate final confidence
      const finalConfidence = results.cnicNumber ? 
        Math.min(95, results.confidence + 20) : // Boost if CNIC found
        Math.max(0, results.confidence);

      console.log('\n' + (results.cnicNumber ? '✅' : '❌') + ' Extraction Result:');
      console.log(`  CNIC: ${results.cnicNumber || 'NOT FOUND'}`);
      console.log(`  Confidence: ${finalConfidence.toFixed(1)}%`);
      console.log(`  Method: ${results.method || 'none'}\n`);

      return {
        success: !!results.cnicNumber,
        extractedCnicNumber: results.cnicNumber,
        extractedName: results.name,
        extractedFatherName: results.fatherName,
        extractedDateOfBirth: null,
        confidence: finalConfidence,
        extractionMethod: results.method,
        rawText: {
          back: backResult?.text || '',
          front: frontResult?.text || ''
        },
        extractedAt: new Date()
      };

    } catch (error) {
      console.error('❌ Template OCR failed:', error);
      return {
        success: false,
        confidence: 0,
        error: error.message
      };
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export default new CNICTemplateOCR();
