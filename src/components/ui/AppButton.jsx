import React from 'react';
import styles from '../../styles.js';

const AppButton = ({ onClick, title, style, textStyle, disabled = false }) => (
  <button onClick={onClick} style={{...styles.button, ...style, ...(disabled ? styles.disabledButton : {})}} disabled={disabled}>
    <p style={{...styles.buttonText, ...textStyle}}>{title}</p>
  </button>
);

export default AppButton;