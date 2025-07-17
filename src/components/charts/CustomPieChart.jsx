import React from 'react';
import styles from '../../styles';

const CustomPieChart = ({ data }) => {
    const total = data.reduce((sum, item) => sum + item.count, 0);
    if (total === 0) return <p style={styles.emptyText}>No data for chart.</p>;

    let accumulated = 0;
    const gradients = data.map(item => {
        const percentage = (item.count / total) * 100;
        const start = accumulated;
        accumulated += percentage;
        const end = accumulated;
        return `${item.color} ${start}% ${end}%`;
    });

    const conicGradient = `conic-gradient(${gradients.join(', ')})`;

    return (
        <div style={{display: 'flex', alignItems: 'center', flexDirection: 'column'}}>
            <div style={{...styles.pieChart, backgroundImage: conicGradient}}></div>
            <div style={styles.legendContainer}>
                {data.map(item => (
                    <div key={item.name} style={styles.legendItem}>
                        <div style={{...styles.legendColorBox, backgroundColor: item.color}}></div>
                        <p style={styles.legendText}>{item.name} ({item.count})</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CustomPieChart;