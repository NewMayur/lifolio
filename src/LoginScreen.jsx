import React, { useState } from 'react';
import { auth } from './firebase'; // Make sure to import your auth object
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    try {
      setError('');
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will automatically handle the redirect/data loading
    } catch (err) {
      setError(err.message);
      console.error("Error signing up:", err);
    }
  };

  const handleSignIn = async () => {
    try {
      setError('');
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will automatically handle the redirect/data loading
    } catch (err) {
      setError(err.message);
      console.error("Error signing in:", err);
    }
  };

  return (
    <div>
      <h2>Login or Sign Up</h2>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button onClick={handleSignIn}>Sign In</button>
      <button onClick={handleSignUp}>Sign Up</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default LoginScreen;