import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

// Function to initialize passport with environment-dependent configuration
export function initializePassport() {
  // Only configure Google strategy if environment variables are available
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"
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
          user.googleId = profile.id;
          user.provider = 'google';
          user.avatar = profile.photos[0]?.value || '';
          await user.save();
          
          return done(null, user);
        }        
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value || '',
          provider: 'google',
          isEmailVerified: true,
          isProfileComplete: false
        });     
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));
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