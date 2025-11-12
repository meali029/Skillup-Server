import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

// Function to initialize passport with environment-dependent configuration
export function initializePassport() {
  // Only configure Google strategy if environment variables are available
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log("🔑 Initializing Google OAuth Strategy:");
    console.log("   Client ID:", process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...");
    console.log("   Callback URL:", process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback");
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("🔐 Google OAuth Strategy Verify Callback:");
        console.log("   Profile ID:", profile.id);
        console.log("   Email:", profile.emails?.[0]?.value);
        console.log("   Name:", profile.displayName);
        
        if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
          console.error("❌ No email in Google profile");
          return done(new Error("No email provided by Google"), null);
        }
        
        // Check if user already exists with this Google ID
        console.log("🔍 Checking for existing user with Google ID...");
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
          console.log("✅ Found existing user with Google ID");
          return done(null, user);
        }
        
        // Check if user exists with same email
        console.log("🔍 Checking for user with email:", profile.emails[0].value);
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          console.log("✅ Found user with matching email, linking Google account");
          // Link Google account to existing user
          user.googleId = profile.id;
          user.provider = 'google';
          user.avatar = profile.photos[0]?.value || '';
          await user.save();
          console.log("✅ Google account linked successfully");
          return done(null, user);
        }
        
        // Create new user with basic info - no role yet
        console.log("🆕 Creating new user from Google profile");
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value || '',
          provider: 'google',
          isEmailVerified: true, // Google emails are pre-verified
          // role is omitted - user will select during profile completion
          isProfileComplete: false
        });
        
        console.log("✅ New user created successfully");
        return done(null, user);
      } catch (error) {
        console.error('❌ Google OAuth Strategy Error:', error.message);
        console.error('   Error name:', error.name);
        console.error('   Stack:', error.stack);
        
        // Check for specific error types
        if (error.name === 'MongoError' || error.name === 'MongoServerError') {
          console.error('   MongoDB Error Code:', error.code);
        }
        
        if (error.name === 'ValidationError') {
          console.error('   Validation Errors:', Object.keys(error.errors));
        }
        
        return done(error, null);
      }
        console.error('❌ Google OAuth Strategy Error:', error.message);
        console.error('   Stack:', error.stack);
        return done(error, null);
      }
    }));
  } else {
    console.warn('⚠️  Google OAuth credentials not found. Google authentication will be disabled.');
  }

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).select('-password');
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  return passport;
}

// Default export for backwards compatibility
export default passport;