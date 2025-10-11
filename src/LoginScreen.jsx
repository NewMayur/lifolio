import React, { useState } from 'react';
import { auth } from './firebase'; // Make sure to import your auth object
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import styles from './styles.js';
import AppButton from './components/ui/AppButton.jsx';
import Card from './components/ui/Card.jsx';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    setIsLoading(true);
    try {
      setError('');
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will automatically handle the redirect/data loading
    } catch (err) {
      setError(err.message);
      console.error("Error signing up:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      setError('');
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will automatically handle the redirect/data loading
    } catch (err) {
      setError(err.message);
      console.error("Error signing in:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (isSignUp) {
      handleSignUp();
    } else {
      handleSignIn();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ fontSize: 40, fontWeight: 'bold', color: '#f0f9ff', marginBottom: 10 }}>Lifefolio</p>
          <p style={{ fontSize: 18, color: '#dbeafe' }}>Invest in yourself, literally.</p>
        </div>

        <Card>
          <p style={{...styles.title, textAlign: 'center', marginBottom: 20}}>
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            style={styles.input}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={styles.input}
          />

          {error && <p style={{ color: '#fca5a5', textAlign: 'center', fontSize: 14 }}>{error}</p>}

          <AppButton
            title={isSignUp ? 'Sign Up' : 'Sign In'}
            onClick={handleSubmit}
            disabled={!email || !password || isLoading}
            style={{ marginTop: 10 , padding: "5px 10px" }}
          />

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <p style={{ color: '#a1a1aa', fontSize: 16 }}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                style={{
                  color: '#3b82f6',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: '600',
                  marginLeft: 5
                }}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginScreen;
