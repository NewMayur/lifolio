import React from 'react';
import styles from '../../styles';

const CustomModal = ({ visible, onClose, children, title }) => {
    if (!visible) return null;
    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContainer}>
                <div style={styles.modalHeader}>
                    <p style={styles.modalTitle}>{title}</p>
                    <button onClick={onClose} style={styles.modalCloseButton}>X</button>
                </div>
                {children}
            </div>
        </div>
    );
};

export default CustomModal;