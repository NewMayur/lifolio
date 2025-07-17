import React, { useContext } from 'react';
import styles from '../../styles.js';
import { WalletContext } from '../../context/WalletContext.js';
import Card from '../ui/Card.jsx';

const HabitCalendar = ({ habit, history }) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const habitHistoryForMonth = history.filter(h => {
        const hDate = new Date(h.date);
        return h.habitId === habit.id && hDate.getFullYear() === year && hDate.getMonth() === month;
    });

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(<div key={`empty-${i}`} style={styles.calendarDay}></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const log = habitHistoryForMonth.find(h => h.date === dateStr);
        let dayStyle = styles.calendarDay;
        if (log) {
            dayStyle = log.status === 'complete' ? styles.calendarDayComplete : styles.calendarDayMissed;
        }
        days.push(<div key={day} style={dayStyle}>{day}</div>);
    }

    return (
        <Card>
            <p style={styles.cardTitle}>{habit.name} - Monthly Progress</p>
            <div style={styles.calendarGrid}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} style={styles.calendarHeader}>{day}</div>)}
                {days}
            </div>
        </Card>
    );
};

export default HabitCalendar;