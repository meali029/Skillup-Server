#!/usr/bin/env python3
"""
Pakistani CNIC OCR Extraction using EasyOCR - Optimized Version
High accuracy extraction for Pakistani National Identity Cards
Extracts: CNIC Number, Name, Father Name, DOB, Issue Date, Expiry Date, Gender
"""

import sys
import json
import os
import re
from datetime import datetime

# Suppress warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['EASYOCR_MODULE_PATH'] = os.path.join(os.path.expanduser('~'), '.EasyOCR')

try:
    import easyocr
    import cv2
    import numpy as np
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Missing dependency: {str(e)}",
        "extractedCnicNumber": None,
        "confidence": 0
    }))
    sys.exit(1)

# Patterns - CNIC can have dash, dot, or space as separator
CNIC_PATTERN = re.compile(r'(\d{5})[-.\s]?(\d{7})[-.\s]?(\d)')
DATE_PATTERN = re.compile(r'(\d{1,2})[./-](\d{1,2})[./-](\d{4})')
VALID_PROVINCE_CODES = ['1', '2', '3', '4', '5', '6', '7', '8']

# Global reader cache for faster subsequent calls
_reader_cache = None

def get_reader():
    """Get cached EasyOCR reader for better performance"""
    global _reader_cache
    if _reader_cache is None:
        print("Initializing EasyOCR...", file=sys.stderr)
        _reader_cache = easyocr.Reader(
            ['en'], 
            gpu=False, 
            verbose=False,
            model_storage_directory=os.environ.get('EASYOCR_MODULE_PATH')
        )
        print("EasyOCR ready", file=sys.stderr)
    return _reader_cache


class CNICExtractor:
    def __init__(self):
        self.reader = get_reader()
    
    def quick_orientation_check(self, img):
        """Quick check to determine if image needs rotation based on aspect ratio"""
        h, w = img.shape[:2]
        
        # CNIC cards are landscape (wider than tall)
        # If portrait, definitely needs rotation
        if h > w:
            return True  # Needs rotation
        
        # Check aspect ratio - CNIC is roughly 1.586:1
        aspect = w / h
        if aspect < 1.2 or aspect > 2.0:
            return True  # Unusual aspect, might need rotation
        
        return False
    
    def find_best_rotation(self, img):
        """Find the correct rotation using optimized detection with early exit"""
        h, w = img.shape[:2]
        
        # Smart rotation order based on aspect ratio
        if h > w:
            # Portrait - try 90° first
            rotations = [
                (90, cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)),
                (270, cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)),
                (0, img),
                (180, cv2.rotate(img, cv2.ROTATE_180)),
            ]
        else:
            # Landscape - try original first
            rotations = [
                (0, img),
                (180, cv2.rotate(img, cv2.ROTATE_180)),
                (90, cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)),
                (270, cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)),
            ]
        
        best_angle = 0
        best_img = img
        best_score = 0
        best_results = []
        
        for angle, rotated_img in rotations:
            print(f"  Checking rotation: {angle}°...", file=sys.stderr)
            
            # Run OCR
            try:
                results = self.reader.readtext(
                    rotated_img,
                    detail=1,
                    paragraph=False,
                    min_size=10,
                    text_threshold=0.5,
                    low_text=0.3
                )
                
                # Score based on CNIC detection and keyword presence
                texts = [r[1].lower() for r in results]
                combined = ' '.join(texts)
                
                score = 0
                
                # Check for CNIC number (highest priority)
                cnic = self._quick_extract_cnic([r[1] for r in results])
                if cnic:
                    score += 100
                    print(f"    Found CNIC: {cnic}", file=sys.stderr)
                
                # Check for key CNIC words
                keywords = ['pakistan', 'identity', 'card', 'name', 'father', 'gender', 
                           'date', 'birth', 'issue', 'expiry', 'holder', 'nadra']
                keyword_count = sum(1 for kw in keywords if kw in combined)
                score += keyword_count * 5
                
                # Confidence bonus
                avg_conf = sum(r[2] for r in results) / len(results) if results else 0
                score += avg_conf * 20
                
                print(f"    Score: {score:.1f} (CNIC: {bool(cnic)}, Keywords: {keyword_count}, Conf: {avg_conf*100:.1f}%)", file=sys.stderr)
                
                if score > best_score:
                    best_score = score
                    best_angle = angle
                    best_img = rotated_img
                    best_results = results
                    
                # Early exit if we found a high-confidence result
                if score >= 120:  # CNIC found + some keywords
                    print(f"  Early exit: High confidence at {angle}°", file=sys.stderr)
                    break
                    
            except Exception as e:
                print(f"    Error: {e}", file=sys.stderr)
                continue
        
        print(f"  Best rotation: {best_angle}°", file=sys.stderr)
        return best_img, best_results, best_angle
    
    def _quick_extract_cnic(self, texts):
        """Quick CNIC extraction from text list - handles dots, dashes, spaces"""
        combined = ' '.join(texts)
        
        # Strategy 1: Look for CNIC near "Identity Number" label (most reliable)
        identity_match = re.search(
            r'[Ii]dentity\s*[Nn]umber[:\s]*(\d{5})[-.\s]?(\d{7})[-.\s]?(\d)',
            combined
        )
        if identity_match:
            cnic = f"{identity_match.group(1)}-{identity_match.group(2)}-{identity_match.group(3)}"
            if cnic[0] in VALID_PROVINCE_CODES:
                print(f"      Found CNIC near Identity Number: {cnic}", file=sys.stderr)
                return cnic
        
        # Strategy 2: Find CNIC with explicit separators (dash or dot)
        # This pattern requires at least one separator to avoid false positives
        cnic_with_sep = re.search(r'(\d{5})[-.](\d{7})[-.]?(\d)', combined)
        if cnic_with_sep:
            cnic = f"{cnic_with_sep.group(1)}-{cnic_with_sep.group(2)}-{cnic_with_sep.group(3)}"
            if cnic[0] in VALID_PROVINCE_CODES:
                print(f"      Found CNIC with separator: {cnic}", file=sys.stderr)
                return cnic
        
        # Strategy 3: Look for 13 consecutive digits (but only in digit-heavy regions)
        # Find all sequences of digits separated by common CNIC separators
        digit_sequences = re.findall(r'[\d][-.\s\d]{11,16}[\d]', combined)
        for seq in digit_sequences:
            digits = re.sub(r'\D', '', seq)
            if len(digits) >= 13:
                cnic = f"{digits[:5]}-{digits[5:12]}-{digits[12]}"
                if cnic[0] in VALID_PROVINCE_CODES:
                    print(f"      Found CNIC from digit sequence: {cnic}", file=sys.stderr)
                    return cnic
        
        # Strategy 4: Last resort - clean OCR errors but be more careful
        # Only look at text AFTER "Identity" or "Number" keywords
        lower_combined = combined.lower()
        identity_pos = max(lower_combined.find('identity'), lower_combined.find('number'))
        if identity_pos > 0:
            search_text = combined[identity_pos:]
        else:
            search_text = combined
        
        # Clean common OCR errors only in the search region
        cleaned = search_text.replace('O', '0').replace('o', '0')
        cleaned = cleaned.replace('l', '1').replace('|', '1')
        
        match = CNIC_PATTERN.search(cleaned)
        if match:
            cnic = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
            if cnic[0] in VALID_PROVINCE_CODES:
                print(f"      Found CNIC via cleaned pattern: {cnic}", file=sys.stderr)
                return cnic
        
        return None

    def extract_all_dates(self, texts):
        """Extract all dates: DOB, Issue Date, Expiry Date"""
        combined = ' '.join(texts)
        combined_lower = combined.lower()
        
        # Find all dates in the text
        all_dates = []
        for match in DATE_PATTERN.finditer(combined):
            day, month, year = match.groups()
            try:
                date_str = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                # Validate date
                date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                all_dates.append({
                    'date': date_str,
                    'date_obj': date_obj,
                    'position': match.start(),
                    'original': match.group(0)
                })
            except ValueError:
                continue
        
        print(f"  Found {len(all_dates)} dates: {[d['original'] for d in all_dates]}", file=sys.stderr)
        
        dob = None
        issue_date = None
        expiry_date = None
        
        # Sort dates chronologically
        sorted_by_time = sorted(all_dates, key=lambda x: x['date_obj'])
        
        # Strategy: Use chronological order + context
        # DOB = oldest (13+ years ago), Issue = middle, Expiry = newest (in future or recent)
        
        if len(sorted_by_time) >= 3:
            # 3 dates: DOB (oldest), Issue (middle), Expiry (newest)
            for d in sorted_by_time:
                age = (datetime.now() - d['date_obj']).days // 365
                if 13 <= age <= 100 and not dob:
                    dob = d['date']
                    print(f"    DOB (oldest, age {age}): {d['date']}", file=sys.stderr)
                    break
            
            # Expiry is the newest date (usually in future)
            for d in reversed(sorted_by_time):
                if d['date'] != dob:
                    expiry_date = d['date']
                    print(f"    Expiry (newest): {d['date']}", file=sys.stderr)
                    break
            
            # Issue is the remaining middle date
            for d in sorted_by_time:
                if d['date'] != dob and d['date'] != expiry_date:
                    issue_date = d['date']
                    print(f"    Issue (middle): {d['date']}", file=sys.stderr)
                    break
                    
        elif len(sorted_by_time) == 2:
            # 2 dates: Could be (DOB, Issue) or (DOB, Expiry) or (Issue, Expiry)
            older = sorted_by_time[0]
            newer = sorted_by_time[1]
            
            older_age = (datetime.now() - older['date_obj']).days // 365
            newer_years_from_now = (newer['date_obj'] - datetime.now()).days / 365
            
            # Check if older date is a valid DOB (13-100 years ago)
            if 13 <= older_age <= 100:
                dob = older['date']
                print(f"    DOB (older, age {older_age}): {older['date']}", file=sys.stderr)
                
                # Newer is either issue or expiry
                if newer_years_from_now > 0:  # In future = expiry
                    expiry_date = newer['date']
                    print(f"    Expiry (future): {newer['date']}", file=sys.stderr)
                else:  # In past = issue
                    issue_date = newer['date']
                    print(f"    Issue (past): {newer['date']}", file=sys.stderr)
            else:
                # No valid DOB, so these are Issue and Expiry
                issue_date = older['date']
                expiry_date = newer['date']
                print(f"    Issue (older): {older['date']}", file=sys.stderr)
                print(f"    Expiry (newer): {newer['date']}", file=sys.stderr)
                
        elif len(sorted_by_time) == 1:
            # Only 1 date - try to figure out what it is
            d = sorted_by_time[0]
            age = (datetime.now() - d['date_obj']).days // 365
            years_from_now = (d['date_obj'] - datetime.now()).days / 365
            
            text_before = combined_lower[max(0, d['position']-30):d['position']]
            
            if 'birth' in text_before:
                dob = d['date']
                print(f"    DOB (context): {d['date']}", file=sys.stderr)
            elif 'expiry' in text_before or years_from_now > 0:
                expiry_date = d['date']
                print(f"    Expiry (context/future): {d['date']}", file=sys.stderr)
            elif 'issue' in text_before:
                issue_date = d['date']
                print(f"    Issue (context): {d['date']}", file=sys.stderr)
            elif 13 <= age <= 100:
                dob = d['date']
                print(f"    DOB (age logic): {d['date']}", file=sys.stderr)
        
        return dob, issue_date, expiry_date
    
    def extract_name_and_father(self, texts):
        """Extract name and father's name from CNIC text"""
        name = None
        father_name = None
        
        combined = ' '.join(texts)
        print(f"  Extracting names from: {combined[:200]}...", file=sys.stderr)
        
        # Pattern: "Name <actual_name> Father Name <father_name>"
        name_match = re.search(
            r'(?:^|[Nn]ame)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:[Ff]ather|[Gg]ender)',
            combined
        )
        if name_match:
            name = name_match.group(1).strip()
            print(f"  Found name via regex: {name}", file=sys.stderr)
        
        # Extract father name
        father_match = re.search(
            r'[Ff]ather[\'s]*\s*[Nn]ame\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:[JVu\}]|[Gg]ender|[Cc]ountry|[Dd]ate|[Ii]dentity|$)',
            combined
        )
        if father_match:
            father_name = father_match.group(1).strip()
            print(f"  Found father name via regex: {father_name}", file=sys.stderr)
        
        # Fallback: position-based extraction
        if not name or not father_name:
            labels_to_skip = ['name', 'father', 'gender', 'country', 'identity', 'date', 'birth', 
                              'issue', 'expiry', 'holder', 'signature', 'pakistan', 'nadra', 'cnic',
                              'number', 'card', 'national', 'islamic', 'republic', 'stay', 'male', 'female']
            
            combined_lower = combined.lower()
            name_idx = combined_lower.find('name ')
            father_idx = combined_lower.find('father')
            gender_idx = combined_lower.find('gender')
            
            if name_idx >= 0 and father_idx > name_idx and not name:
                text_between = combined[name_idx + 5:father_idx].strip()
                text_between = re.sub(r'^[:\-\s]+', '', text_between)
                if text_between:
                    words = text_between.split()
                    clean_words = [w for w in words if w.lower() not in labels_to_skip and len(w) > 1]
                    if clean_words:
                        name = ' '.join(clean_words)
                        print(f"  Found name via position: {name}", file=sys.stderr)
            
            if father_idx >= 0 and not father_name:
                end_idx = gender_idx if gender_idx > father_idx else len(combined)
                start_idx = father_idx + 6
                text_after = combined[start_idx:end_idx].strip()
                text_after = re.sub(r'^[Nn]ame\s*', '', text_after).strip()
                text_after = re.sub(r'^[:\-\s]+', '', text_after)
                if text_after:
                    text_after = re.sub(r'[JVu\}\{\[\]]+.*$', '', text_after).strip()
                    words = text_after.split()
                    clean_words = [w for w in words if w.lower() not in labels_to_skip and len(w) > 1 and re.match(r'^[A-Za-z]+$', w)]
                    if clean_words:
                        father_name = ' '.join(clean_words[:3])
                        print(f"  Found father name via position: {father_name}", file=sys.stderr)
        
        # Final cleanup
        if name:
            name = re.sub(r'[^a-zA-Z\s]', '', name).strip()
            name = re.sub(r'\s+', ' ', name)
        if father_name:
            father_name = re.sub(r'[^a-zA-Z\s]', '', father_name).strip()
            father_name = re.sub(r'\s+', ' ', father_name)
        
        print(f"  Final extracted - Name: {name}, Father: {father_name}", file=sys.stderr)
        return name, father_name
    
    def extract_gender(self, texts):
        """Extract gender from text"""
        combined = ' '.join(texts).lower()
        if 'male' in combined and 'female' not in combined:
            return 'Male'
        elif 'female' in combined:
            return 'Female'
        # Check for M/F near gender label
        gender_match = re.search(r'gender[:\s]*([MF])', ' '.join(texts), re.IGNORECASE)
        if gender_match:
            return 'Male' if gender_match.group(1).upper() == 'M' else 'Female'
        return None
    
    def process(self, front_path, back_path=None):
        """Process CNIC images with optimized rotation detection"""
        result = {
            'success': False,
            'extractedCnicNumber': None,
            'extractedName': None,
            'extractedFatherName': None,
            'extractedDateOfBirth': None,
            'extractedDateOfIssue': None,
            'extractedDateOfExpiry': None,
            'extractedGender': None,
            'confidence': 0,
            'method': 'easyocr',
            'errors': []
        }
        
        try:
            # Process FRONT image
            print(f"\n=== Processing FRONT: {front_path} ===", file=sys.stderr)
            front_img = cv2.imread(front_path)
            if front_img is None:
                result['errors'].append(f"Cannot read front image: {front_path}")
                return result
            
            print(f"  Original size: {front_img.shape}", file=sys.stderr)
            
            # Find best rotation and get OCR results
            print("  Finding best rotation...", file=sys.stderr)
            best_img, ocr_results, best_angle = self.find_best_rotation(front_img)
            
            # Extract texts from results
            texts = [r[1] for r in ocr_results]
            avg_conf = sum(r[2] for r in ocr_results) / len(ocr_results) * 100 if ocr_results else 0
            
            # Extract CNIC
            result['extractedCnicNumber'] = self._quick_extract_cnic(texts)
            result['confidence'] = avg_conf
            
            # Extract names
            name, father_name = self.extract_name_and_father(texts)
            result['extractedName'] = name
            result['extractedFatherName'] = father_name
            
            # Extract all dates (DOB, Issue, Expiry)
            dob, issue_date, expiry_date = self.extract_all_dates(texts)
            result['extractedDateOfBirth'] = dob
            result['extractedDateOfIssue'] = issue_date
            result['extractedDateOfExpiry'] = expiry_date
            
            # Extract gender
            result['extractedGender'] = self.extract_gender(texts)
            
            # If CNIC not found on front, try back
            if back_path and not result['extractedCnicNumber']:
                print(f"\n=== Processing BACK: {back_path} ===", file=sys.stderr)
                back_img = cv2.imread(back_path)
                if back_img is not None:
                    print(f"  Original size: {back_img.shape}", file=sys.stderr)
                    best_img, ocr_results, _ = self.find_best_rotation(back_img)
                    texts = [r[1] for r in ocr_results]
                    cnic = self._quick_extract_cnic(texts)
                    if cnic:
                        result['extractedCnicNumber'] = cnic
                        avg_conf = sum(r[2] for r in ocr_results) / len(ocr_results) * 100 if ocr_results else 0
                        result['confidence'] = max(result['confidence'], avg_conf)
            
            result['success'] = result['extractedCnicNumber'] is not None
            
        except Exception as e:
            result['errors'].append(str(e))
            print(f"Error: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: paddle_ocr.py <front> [back]"}))
        sys.exit(1)
    
    front_path = sys.argv[1]
    back_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(front_path):
        print(json.dumps({"success": False, "error": f"Front image not found: {front_path}"}))
        sys.exit(1)
    
    extractor = CNICExtractor()
    result = extractor.process(front_path, back_path)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
