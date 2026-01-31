import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

// Function to initialize passport with environment-dependent configuration
export function initializePassport() {
  // Only configure Google strategy if environment variables are available
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    
    // CRITICAL: Use environment-based callback URL - NO hardcoded localhost
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;
    if (!callbackURL) {
      console.warn('[Passport] WARNING: GOOGLE_CALLBACK_URL not set. Google OAuth may not work correctly.');
    }
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL || "http://localhost:5000/api/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
          return done(new Error("No email provided by Google"), null);
        }
        
        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
          // Check if user is banned or suspended
          if (user.isBanned) {
            return done(new Error("Your account has been banned. Please contact our help center for assistance."), null);
          }
          if (!user.isActive) {
            return done(new Error("Your account has been suspended. Please contact our help center for assistance."), null);
          }
          return done(null, user);
        }
        
        // Check if user exists with same email
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Check if user is banned or suspended
          if (user.isBanned) {
            return done(new Error("Your account has been banned. Please contact our help center for assistance."), null);
          }
          if (!user.isActive) {
            return done(new Error("Your account has been suspended. Please contact our help center for assistance."), null);
          }
          
          // Link Google account to existing user
          // IMPORTANT: Don't overwrite provider if user registered locally
          // This allows users to login with BOTH password AND Google
          if (!user.googleId) {
            user.googleId = profile.id;
            console.log('[Passport] Linked Google account to existing user:', user.email);
          }
          
          // Only set provider to 'google' if user doesn't have a password (pure OAuth user)
          // If user has password, keep provider as 'local' or set to 'both' to indicate linked account
          if (user.provider === 'local') {
            user.provider = 'both'; // User can login with both password and Google
            console.log('[Passport] User can now login with both password and Google:', user.email);
          }
          
          // Update avatar only if user doesn't have one
          if (!user.avatar && profile.photos[0]?.value) {
            user.avatar = profile.photos[0].value;
          }
          
          // CRITICAL: Google users are auto-verified
          user.isEmailVerified = true;
          await user.save();
          
          return done(null, user);
        }
        
        // Create new user - Google users are email-verified by default
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value || '',
          provider: 'google',
          // CRITICAL: Google users are auto-verified and need to complete profile
          isEmailVerified: true,
          isProfileComplete: false
        });
        
        console.log('[Passport] New Google user created:', user.email, '- Profile incomplete, email verified');
        return done(null, user);
      } catch (error) {
        console.error('[Passport] Google OAuth error:', error);
        return done(error, null);
      }
    }));
  } else {
    console.warn('[Passport] Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
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