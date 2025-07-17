import React from 'react';
import styles from '../../styles.js';

const Card = ({ children, style }) => (
  <div style={{...styles.card, ...style}}>{children}</div>
);

export default Card;