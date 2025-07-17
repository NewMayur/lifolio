import React from 'react';
import styles from '../../styles.js';

const CustomBarChart = ({ data }) => {
    if (!data.labels || data.labels.length === 0) return <p style={styles.emptyText}>No data for chart.</p>;

    const values = data.datasets[0].data;
    const maxVal = Math.max(...values.map(v => Math.abs(v)), 1);

    return (
        <div style={styles.barChartContainer}>
            {values.map((value, index) => (
                <div key={index} style={styles.barWrapper}>
                    <div style={{...styles.bar, height: `${(Math.abs(value) / maxVal) * 100}%`, backgroundColor: value >= 0 ? '#4ade80' : '#f87171'}}></div>
                    <p style={styles.barLabel}>{data.labels[index]}</p>
                </div>
            ))}
        </div>
    );
};

export default CustomBarChart;