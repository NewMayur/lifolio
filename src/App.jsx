import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import localforage from 'localforage';

// --- MOCK ASYNCSTORAGE / LOCALSTORAGE ---
// We'll use a simple object to simulate localStorage for this environment.
const AppStorage = {
  setItem: async (key, value) => localforage.setItem(key, value),
  getItem: async (key) => localforage.getItem(key),
  removeItem: async (key) => localforage.removeItem(key),
};

// --- CONSTANTS ---
const INITIAL_WALLET_BALANCE = 200;
const CURRENCY = "₹";

// --- CONTEXT ---
const WalletContext = createContext();

const WalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState({ balance: INITIAL_WALLET_BALANCE, currency: CURRENCY });
  const [habits, setHabits] = useState([]);
  const [habitHistory, setHabitHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState({ focusArea: '' });

  // Load data from storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedProfile = await AppStorage.getItem('userProfile');
        const storedHabits = await AppStorage.getItem('habits');
        const storedHistory = await AppStorage.getItem('habitHistory');

        if (storedProfile) {
          const profile = JSON.parse(storedProfile);
          setWallet(profile.wallet);
          setUserProfile(profile);
        }
        if (storedHabits) {
          setHabits(JSON.parse(storedHabits));
        }
        if (storedHistory) {
          setHabitHistory(JSON.parse(storedHistory));
        }
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Persist data whenever it changes
  useEffect(() => {
    if (!isLoading) {
      AppStorage.setItem('userProfile', JSON.stringify({ ...userProfile, wallet }));
    }
  }, [wallet, userProfile, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AppStorage.setItem('habits', JSON.stringify(habits));
    }
  }, [habits, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AppStorage.setItem('habitHistory', JSON.stringify(habitHistory));
    }
  }, [habitHistory, isLoading]);

  const updateWallet = (amount) => {
    setWallet(prev => ({ ...prev, balance: prev.balance + amount }));
  };

  const addHabit = (habit, cost) => {
    const newHabits = [...habits, habit];
    setHabits(newHabits);
    updateWallet(-cost);
  };

  const logHabitAction = (habitId, status, change, date) => {
    const newLog = {
      habitId,
      date: date,
      status,
      change,
    };
    setHabitHistory(prev => [...prev, newLog]);
    updateWallet(change);
  };
  
  const resetAppData = async () => {
      await AppStorage.removeItem('userProfile');
      await AppStorage.removeItem('habits');
      await AppStorage.removeItem('habitHistory');
      await AppStorage.removeItem('lastAutoMissDate');
      setWallet({ balance: INITIAL_WALLET_BALANCE, currency: CURRENCY });
      setUserProfile({ focusArea: '' });
      setHabits([]);
      setHabitHistory([]);
      console.log("App data has been reset.");
  };

  return (
    <WalletContext.Provider value={{ wallet, habits, habitHistory, userProfile, setUserProfile, addHabit, logHabitAction, isLoading, resetAppData }}>
      {children}
    </WalletContext.Provider>
  );
};

// --- AI SUGGESTIONS SERVICE ---
const aiSuggestions = {
  getSuggestion: (habits, history) => {
    if (habits.length === 0) {
      return { title: "Get Started!", message: "Create your first habit to begin building a better you." };
    }

    const recentHistory = history.filter(h => {
        const daysAgo = (new Date() - new Date(h.date)) / (1000 * 60 * 60 * 24);
        return daysAgo <= 7;
    });

    const missedHabits = recentHistory.filter(h => h.status === 'missed');
    if (missedHabits.length > 2) {
      const mostMissed = missedHabits.reduce((acc, h) => {
          acc[h.habitId] = (acc[h.habitId] || 0) + 1;
          return acc;
      }, {});
      const topMissedId = Object.keys(mostMissed).sort((a,b) => mostMissed[b] - mostMissed[a])[0];
      const habit = habits.find(h => h.id === topMissedId);
      if(habit) return { title: "Struggling?", message: `You've missed "${habit.name}" a few times. Consider lowering the penalty to make it less daunting.` };
    }
    
    const completedStreaks = habits.map(habit => {
        const habitHistory = recentHistory.filter(h => h.habitId === habit.id && h.status === 'complete');
        return { habit, count: habitHistory.length };
    }).filter(item => item.count >= 3);

    if (completedStreaks.length > 0) {
        const topStreakHabit = completedStreaks.sort((a,b) => b.count - a.count)[0].habit;
        return { title: "On a Roll!", message: `You're consistent with "${topStreakHabit.name}". Maybe it's time to increase the reward?` };
    }

    return { title: "Stay Focused", message: "Consistency is key. Keep logging your habits daily to see progress." };
  }
};

// --- REUSABLE UI COMPONENTS (Web Version) ---
const AppButton = ({ onClick, title, style, textStyle, disabled = false }) => (
  <button onClick={onClick} style={{...styles.button, ...style, ...(disabled ? styles.disabledButton : {})}} disabled={disabled}>
    <p style={{...styles.buttonText, ...textStyle}}>{title}</p>
  </button>
);

const Card = ({ children, style }) => (
  <div style={{...styles.card, ...style}}>{children}</div>
);

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

// --- CHART COMPONENTS (Web Version) ---
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


// --- SCREENS (Web Version) ---

const OnboardingScreen = ({ onComplete }) => {
  const { setUserProfile, resetAppData } = useContext(WalletContext);
  const [step, setStep] = useState(1);
  const [focusArea, setFocusArea] = useState('');

  useEffect(() => {
    resetAppData();
  }, []);

  const handleComplete = async () => {
    const profileData = { wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY }, focusArea };
    setUserProfile(profileData); // Update context
    await AppStorage.setItem('userProfile', JSON.stringify(profileData));
    onComplete();
  };
  
  return (
    <div style={styles.onboardingContainer}>
      <div style={styles.scrollContent}>
        {step === 1 && (
          <>
            <p style={styles.onboardingTitle}>Welcome to Lifefolio</p>
            <p style={styles.onboardingSubtitle}>Invest in yourself, literally.</p>
            <Card>
              <p style={styles.cardTitle}>How it works:</p>
              <p style={styles.onboardingText}>1. You get a starting wallet balance.</p>
              <p style={styles.onboardingText}>2. You 'invest' in habits by setting rewards & penalties.</p>
              <p style={styles.onboardingText}>3. Complete habits to earn. Miss them and you pay.</p>
            </Card>
            <AppButton title="Let's Get Started" onClick={() => setStep(2)} style={{ marginTop: 30 }} />
          </>
        )}
        {step === 2 && (
          <>
            <p style={styles.onboardingTitle}>Your Starting Capital</p>
            <p style={styles.onboardingSubtitle}>We're giving you {CURRENCY}{INITIAL_WALLET_BALANCE} to start your journey.</p>
            <Card>
              <p style={styles.cardTitle}>What's your primary focus?</p>
              <input
                style={styles.input}
                placeholder="e.g., Health, Career, Learning"
                value={focusArea}
                onChange={(e) => setFocusArea(e.target.value)}
              />
            </Card>
            <AppButton title="Complete Setup" onClick={handleComplete} disabled={!focusArea} style={{ marginTop: 30 }} />
          </>
        )}
      </div>
    </div>
  );
};


const DashboardScreen = ({ navigate }) => {
  const { wallet, habits, habitHistory, isLoading } = useContext(WalletContext);
  const suggestion = aiSuggestions.getSuggestion(habits, habitHistory);

  if (isLoading) {
    return <div style={styles.container}><p style={styles.title}>Loading...</p></div>;
  }

  const getHabitTrend = (habitId) => {
    const today = new Date();
    const recentHistory = habitHistory.filter(h => {
        const hDate = new Date(h.date);
        const diffDays = (today - hDate) / (1000 * 60 * 60 * 24);
        return h.habitId === habitId && diffDays <= 7;
    });
    const completed = recentHistory.filter(h => h.status === 'complete').length;
    const missed = recentHistory.filter(h => h.status === 'missed').length;
    if (completed > missed) return '🟢';
    if (missed > completed) return '🔴';
    return '⚪️';
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Dashboard</p>
        
        <div style={styles.walletCard}>
          <p style={styles.walletLabel}>Wallet Balance</p>
          <p style={styles.walletBalance}>{wallet.currency}{wallet.balance.toFixed(2)}</p>
        </div>

        <Card style={styles.suggestionCard}>
            <p style={styles.suggestionTitle}>🤖 {suggestion.title}</p>
            <p style={styles.suggestionMessage}>{suggestion.message}</p>
        </Card>

        <div style={styles.sectionHeader}>
          <p style={styles.title}>Your Habits</p>
          <AppButton title="+ New Habit" onClick={() => navigate('CreateHabit')} style={styles.smallButton} textStyle={styles.smallButtonText} />
        </div>

        {habits.length === 0 ? (
          <p style={styles.emptyText}>No habits yet. Tap '+ New Habit' to create one!</p>
        ) : (
          habits.map(item => (
              <Card key={item.id} style={styles.habitItem}>
                <p style={styles.habitTrend}>{getHabitTrend(item.id)}</p>
                <div style={{ flex: 1 }}>
                    <p style={styles.habitName}>{item.name}</p>
                    <p style={styles.habitArea}>{item.area}</p>
                </div>
                <div style={{textAlign: 'right'}}>
                    <p style={styles.habitReward}>+{CURRENCY}{item.reward}</p>
                    <p style={styles.habitPenalty}>-{CURRENCY}{item.penalty}</p>
                </div>
              </Card>
            ))
        )}
      </div>
    </div>
  );
};

const CreateHabitScreen = ({ navigate }) => {
  const { wallet, addHabit, userProfile } = useContext(WalletContext);
  const [name, setName] = useState('');
  const [area, setArea] = useState(userProfile.focusArea || '');
  const [reward, setReward] = useState('');
  const [penalty, setPenalty] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
  const [habitIdeas, setHabitIdeas] = useState('');
  const [creationCost, setCreationCost] = useState(35);

  useEffect(() => {
    const r = parseFloat(reward) || 0;
    const p = parseFloat(penalty) || 0;
    // Base cost: 10% of reward + 5% of penalty, with a minimum of 5.
    const baseCost = Math.max(5, (r * 0.1) + (p * 0.05));
    // Final investment cost is 7 times the base cost (a week's worth).
    const finalCost = baseCost * 7;
    setCreationCost(finalCost);
  }, [reward, penalty]);


  const callGeminiAPI = async (prompt) => {
      setIsGenerating(true);
      setAnalysis('✨ Analyzing with Gemini...');
      let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };
      const apiKey = ""; // Left empty as per instructions
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      
      try {
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          const result = await response.json();
          if (result.candidates && result.candidates.length > 0 &&
              result.candidates[0].content && result.candidates[0].content.parts &&
              result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
          } else {
            return "Sorry, I couldn't generate a response right now.";
          }
      } catch (error) {
          console.error("Gemini API call failed:", error);
          return "Error connecting to the AI. Please check your connection.";
      } finally {
          setIsGenerating(false);
      }
  };

  const handleSuggestHabits = async () => {
      const prompt = `Based on a primary life focus area of "${area || 'general well-being'}", suggest 5 creative and actionable daily habits. For each habit, provide a brief, one-sentence description. Format the response as a simple list.`;
      const ideas = await callGeminiAPI(prompt);
      setHabitIdeas(ideas);
      setSuggestionModalVisible(true);
  };
  
  const handleAnalyzeHabit = useCallback(async () => {
    if (name && reward && penalty) {
        const prompt = `Analyze a habit called "${name}" with a reward of ${CURRENCY}${reward} and a penalty of ${CURRENCY}${penalty}. Provide a short, motivational analysis (2-3 sentences) on its psychological effectiveness. Is it well-balanced, high-risk, or heavily incentivized?`;
        const geminiAnalysis = await callGeminiAPI(prompt);
        setAnalysis(geminiAnalysis);
    }
  }, [name, reward, penalty]);


  const handleCreate = () => {
    if (wallet.balance < creationCost) {
      alert("Insufficient funds to create this habit.");
      return;
    }
    const newHabit = {
      id: `habit_${Date.now()}`,
      name,
      area,
      reward: parseFloat(reward),
      penalty: parseFloat(penalty),
      createdOn: new Date().toISOString(),
    };
    addHabit(newHabit, creationCost);
    navigate('Dashboard');
  };
  
  const canAfford = wallet.balance >= creationCost;
  const isFormValid = name && area && reward && penalty && parseFloat(reward) > 0 && parseFloat(penalty) >= 0 && canAfford;

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Create New Habit</p>
        
        <Card>
          <AppButton title="✨ Suggest Habit Ideas" onClick={handleSuggestHabits} disabled={isGenerating} style={{marginBottom: 20, backgroundColor: '#581c87'}}/>
          
          <p style={styles.label}>Habit Name</p>
          <input style={styles.input} placeholder="e.g., Morning Workout" value={name} onChange={e => setName(e.target.value)} />

          <p style={styles.label}>Area of Life</p>
          <input style={styles.input} placeholder="e.g., Health" value={area} onChange={e => setArea(e.target.value)} />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, marginRight: 8 }}>
              <p style={styles.label}>Reward ({CURRENCY})</p>
              <input style={styles.input} type="number" placeholder="50" value={reward} onChange={e => setReward(e.target.value)} />
            </div>
            <div style={{ flex: 1, marginLeft: 8 }}>
              <p style={styles.label}>Penalty ({CURRENCY})</p>
              <input style={styles.input} type="number" placeholder="20" value={penalty} onChange={e => setPenalty(e.target.value)} />
            </div>
          </div>

          <div style={styles.costContainer}>
            <p style={styles.costLabel}>1-Week Investment Cost: {CURRENCY}{creationCost.toFixed(2)}</p>
            <p style={styles.costSublabel}>(non-refundable)</p>
          </div>
          {!canAfford && (
            <p style={styles.errorText}>
              Insufficient funds. Your balance is {CURRENCY}{wallet.balance.toFixed(2)}.
            </p>
          )}

          <AppButton title="✨ Analyze Habit Structure" onClick={handleAnalyzeHabit} disabled={isGenerating || !name || !reward || !penalty} style={{marginTop: 10, backgroundColor: '#1d4ed8'}}/>
          
          {analysis && <p style={styles.analysisText}>{analysis}</p>}
        </Card>

        <AppButton title="Create Habit" onClick={handleCreate} disabled={!isFormValid || isGenerating} style={{ marginTop: 20 }} />
      </div>
      <CustomModal
        visible={suggestionModalVisible}
        onClose={() => setSuggestionModalVisible(false)}
        title="✨ AI-Generated Habit Ideas"
      >
        <p style={{...styles.modalText, whiteSpace: 'pre-wrap'}}>{isGenerating ? 'Generating...' : habitIdeas}</p>
        <AppButton title="Close" onClick={() => setSuggestionModalVisible(false)} style={{marginTop: 15}}/>
      </CustomModal>
    </div>
  );
};


const DailyTrackerScreen = ({ navigate }) => {
  const { habits, habitHistory, logHabitAction } = useContext(WalletContext);
  const [todayHabits, setTodayHabits] = useState([]);
  const [aiHint, setAiHint] = useState('');
  const [showHintModal, setShowHintModal] = useState(false);

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const loggedTodayIds = habitHistory
      .filter(h => h.date === todayStr)
      .map(h => h.habitId);
    
    setTodayHabits(habits.filter(h => !loggedTodayIds.includes(h.id)));
  }, [habits, habitHistory]);

  const handleAction = (habit, status) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const change = status === 'complete' ? habit.reward : -habit.penalty;
    logHabitAction(habit.id, status, change, todayStr);

    if (status === 'missed') {
        setAiHint(`Skipping "${habit.name}" can set you back. Consider if the penalty is high enough to motivate you next time.`);
        setShowHintModal(true);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Today's Tracker</p>
        <p style={styles.subtitle}>{new Date().toDateString()}</p>

        {todayHabits.length === 0 ? (
          <Card>
            <p style={styles.emptyText}>All habits for today are logged! 🎉</p>
          </Card>
        ) : (
          todayHabits.map(item => (
              <Card key={item.id} style={styles.trackerItem}>
                <div>
                  <p style={styles.habitName}>{item.name}</p>
                  <p style={styles.habitArea}>{item.area}</p>
                </div>
                <div style={styles.trackerActions}>
                  <button style={{...styles.actionButton, ...styles.completeButton}} onClick={() => handleAction(item, 'complete')}>
                    <span style={styles.actionButtonText}>✓</span>
                  </button>
                  <button style={{...styles.actionButton, ...styles.missButton}} onClick={() => handleAction(item, 'missed')}>
                    <span style={styles.actionButtonText}>✕</span>
                  </button>
                </div>
              </Card>
            ))
        )}
      </div>
      <CustomModal
        visible={showHintModal}
        onClose={() => setShowHintModal(false)}
        title="🤖 AI Hint"
      >
        <p style={styles.modalText}>{aiHint}</p>
        <AppButton title="Got it" onClick={() => setShowHintModal(false)} style={{marginTop: 15}}/>
      </CustomModal>
    </div>
  );
};


const ReportsScreen = ({ navigate }) => {
  const { habits, habitHistory } = useContext(WalletContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);

  const handleGenerateSummary = async () => {
      setIsGenerating(true);
      setSummaryModalVisible(true);
      setSummary('✨ Analyzing your week with Gemini...');

      const prompt = `Here is my habit data for the last 7 days: ${JSON.stringify(habitHistory)}. My habits are: ${JSON.stringify(habits)}. Please provide a concise, encouraging, and actionable weekly summary. Identify my strongest habit and my biggest challenge. Offer one specific tip for improvement. Keep it under 150 words.`;

      let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      try {
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          const result = await response.json();
          if (result.candidates && result.candidates.length > 0) {
              setSummary(result.candidates[0].content.parts[0].text);
          } else {
              setSummary("Could not generate a summary at this time.");
          }
      } catch (error) {
          console.error("Gemini summary failed:", error);
          setSummary("Error connecting to the AI for your summary.");
      } finally {
          setIsGenerating(false);
      }
  };

  const earningsData = habitHistory.reduce((acc, h) => {
    if (h.change > 0) acc.earnings += h.change;
    else acc.losses += Math.abs(h.change);
    return acc;
  }, { earnings: 0, losses: 0 });

  const areaDistribution = habits.reduce((acc, h) => {
      const area = h.area || 'Uncategorized';
      if (!acc[area]) {
          acc[area] = { name: area, count: 0, color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}` };
      }
      acc[area].count++;
      return acc;
  }, {});

  const pieChartData = Object.values(areaDistribution);

  const profitLossPerHabit = habits.map(habit => {
      const historyForHabit = habitHistory.filter(h => h.habitId === habit.id);
      const total = historyForHabit.reduce((sum, h) => sum + h.change, 0);
      return { name: habit.name, total };
  });

  const barChartData = {
    labels: profitLossPerHabit.map(h => h.name.substring(0,5)),
    datasets: [{
      data: profitLossPerHabit.map(h => h.total)
    }]
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <div style={styles.sectionHeader}>
            <p style={styles.headerTitle}>Reports & Insights</p>
            <AppButton title="✨ Weekly Summary" onClick={handleGenerateSummary} disabled={isGenerating} style={{backgroundColor: '#581c87'}}/>
        </div>

        <Card>
          <p style={styles.cardTitle}>Overall Performance</p>
          <div style={styles.summaryContainer}>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Earnings</p>
              <p style={{...styles.summaryValue, color: '#4ade80' }}>{CURRENCY}{earningsData.earnings.toFixed(2)}</p>
            </div>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Losses</p>
              <p style={{...styles.summaryValue, color: '#f87171' }}>{CURRENCY}{earningsData.losses.toFixed(2)}</p>
            </div>
          </div>
        </Card>

        {habits.map(habit => <HabitCalendar key={habit.id} habit={habit} history={habitHistory} />)}

        {pieChartData.length > 0 && (
          <Card>
            <p style={styles.cardTitle}>Habit Area Distribution</p>
            <CustomPieChart data={pieChartData} />
          </Card>
        )}
        
        {barChartData.labels.length > 0 && (
          <Card>
            <p style={styles.cardTitle}>Profit/Loss per Habit</p>
            <CustomBarChart data={barChartData} />
          </Card>
        )}
      </div>
      <CustomModal
        visible={summaryModalVisible}
        onClose={() => setSummaryModalVisible(false)}
        title="✨ Your AI-Powered Weekly Summary"
      >
        <p style={{...styles.modalText, whiteSpace: 'pre-wrap'}}>{summary}</p>
        <AppButton title="Close" onClick={() => setSummaryModalVisible(false)} disabled={isGenerating} style={{marginTop: 15}}/>
      </CustomModal>
    </div>
  );
};

const SettingsScreen = ({ navigate, onReset }) => {
    const { resetAppData } = useContext(WalletContext);
    const [isResetModalVisible, setResetModalVisible] = useState(false);

    const handleReset = () => {
        resetAppData();
        setResetModalVisible(false);
        onReset(); // Navigate back to onboarding
    };

    return (
        <div style={styles.container}>
            <div style={styles.scrollContent}>
                <p style={styles.headerTitle}>Settings</p>

                <Card>
                    <p style={styles.cardTitle}>Data Management</p>
                    <AppButton
                        title="Reset All Data"
                        onClick={() => setResetModalVisible(true)}
                        style={{ backgroundColor: '#ef4444' }}
                    />
                    <p style={styles.settingDescription}>
                        This will delete all your habits, history, and wallet data. This action cannot be undone.
                    </p>
                </Card>
                
                <Card>
                    <p style={styles.cardTitle}>About Lifefolio</p>
                    <p style={styles.settingDescription}>
                        Version 1.4.0 (Web + AI + Weekly Investment)
                    </p>
                     <p style={styles.settingDescription}>
                        Invest in yourself, intelligently.
                    </p>
                </Card>

            </div>
            <CustomModal
                visible={isResetModalVisible}
                onClose={() => setResetModalVisible(false)}
                title="Confirm Reset"
            >
                <p style={{...styles.modalText, whiteSpace: 'pre-wrap'}}>Are you sure you want to delete all your data? This is irreversible.</p>
                <div style={{display: 'flex', justifyContent: 'space-around', marginTop: 20}}>
                    <AppButton title="Cancel" onClick={() => setResetModalVisible(false)} style={{backgroundColor: '#6b7280', flex: 1, marginRight: 10}}/>
                    <AppButton title="Yes, Reset" onClick={handleReset} style={{backgroundColor: '#ef4444', flex: 1}}/>
                </div>
            </CustomModal>
        </div>
    );
};


// --- MAIN APP CONTAINER ---
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Onboarding');
  const [isAppReady, setIsAppReady] = useState(false);
  
  const AutoMissHandler = () => {
      const { habits, habitHistory, logHabitAction, isLoading } = useContext(WalletContext);

      useEffect(() => {
          if (isLoading || habits.length === 0) return;

          const runAutoMiss = async () => {
              const todayStr = new Date().toISOString().split('T')[0];
              const lastRun = await AppStorage.getItem('lastAutoMissDate');

              if (lastRun === todayStr) {
                  console.log("Auto-miss already ran today.");
                  return;
              }
              
              console.log("Running daily auto-miss check...");
              
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];
              
              const loggedYesterdayIds = new Set(habitHistory.filter(h => h.date === yesterdayStr).map(h => h.habitId));

              habits.forEach(habit => {
                  const habitStartDate = new Date(habit.createdOn).toISOString().split('T')[0];
                  if (habitStartDate <= yesterdayStr && !loggedYesterdayIds.has(habit.id)) {
                      console.log(`Auto-missing habit: ${habit.name} for ${yesterdayStr}`);
                      logHabitAction(habit.id, 'missed', -habit.penalty, yesterdayStr);
                  }
              });

              await AppStorage.setItem('lastAutoMissDate', todayStr);
          };

          runAutoMiss();
      }, [isLoading, habits]);

      return null; // This component does not render anything
  };


  useEffect(() => {
    const checkOnboarding = async () => {
      const profile = await AppStorage.getItem('userProfile');
      if (profile) {
        setCurrentScreen('Dashboard');
      } else {
        setCurrentScreen('Onboarding');
      }
      setIsAppReady(true);
    };
    checkOnboarding();
  }, []);

  const navigate = (screen) => setCurrentScreen(screen);
  
  const handleReset = () => {
    setCurrentScreen('Onboarding');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Onboarding':
        return <OnboardingScreen onComplete={() => navigate('Dashboard')} />;
      case 'Dashboard':
        return <DashboardScreen navigate={navigate} />;
      case 'CreateHabit':
        return <CreateHabitScreen navigate={navigate} />;
      case 'Tracker':
        return <DailyTrackerScreen navigate={navigate} />;
      case 'Reports':
        return <ReportsScreen navigate={navigate} />;
      case 'Settings':
        return <SettingsScreen navigate={navigate} onReset={handleReset} />;
      default:
        return <DashboardScreen navigate={navigate} />;
    }
  };
  
  if (!isAppReady) {
      return (
          <div style={styles.onboardingContainer}>
              <p style={styles.title}>Loading Lifefolio...</p>
          </div>
      );
  }

  return (
    <WalletProvider>
      <AutoMissHandler />
      <div style={styles.appContainer}>
        <div style={{ flex: 1, overflowY: 'auto', height: '100%' }}>{renderScreen()}</div>
        {currentScreen !== 'Onboarding' && (
             <div style={styles.navigation}>
                <button style={styles.navButton} onClick={() => navigate('Dashboard')}>
                    <span style={styles.navText}>🏠</span>
                </button>
                <button style={styles.navButton} onClick={() => navigate('Tracker')}>
                    <span style={styles.navText}>📆</span>
                </button>
                <button style={styles.navButton} onClick={() => navigate('Reports')}>
                    <span style={styles.navText}>📊</span>
                </button>
                <button style={styles.navButton} onClick={() => navigate('Settings')}>
                    <span style={styles.navText}>⚙️</span>
                </button>
            </div>
        )}
      </div>
    </WalletProvider>
  );
}

// --- STYLES (Web Version using JS Objects) ---
const styles = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxHeight: '100vh',
    backgroundColor: '#1c1917',
    fontFamily: 'sans-serif',
  },
  container: {
    flex: 1,
    backgroundColor: '#1c1917',
    paddingTop: 40,
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f0f9ff',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e5e7eb',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#a1a1aa',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: '15px 0',
    borderRadius: 12,
    textAlign: 'center',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
    transition: 'background-color 0.2s',
  },
  disabledButton: {
      backgroundColor: '#4b5563',
      cursor: 'not-allowed',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    margin: 0,
  },
  smallButton: {
    padding: '8px 12px',
  },
  smallButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#262626',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    border: '1px solid #404040',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d4d4d8',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#1c1917',
    color: '#e5e7eb',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 15,
    border: '1px solid #52525b',
    width: 'calc(100% - 32px)',
  },
  label: {
    fontSize: 16,
    color: '#a1a1aa',
    marginBottom: 8,
  },
  onboardingContainer: {
      flex: 1,
      paddingTop: 40,
      backgroundImage: 'linear-gradient(to bottom, #1e3a8a, #1c1917)',
      color: 'white',
      textAlign: 'center'
  },
  onboardingTitle: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  onboardingSubtitle: {
    fontSize: 18,
    color: '#dbeafe',
    textAlign: 'center',
    marginBottom: 40,
  },
  onboardingText: {
    fontSize: 16,
    color: '#d4d4d8',
    marginBottom: 10,
    lineHeight: 1.5,
    textAlign: 'left',
  },
  walletCard: {
    borderRadius: 20,
    padding: 25,
    marginBottom: 20,
    textAlign: 'center',
    backgroundImage: 'linear-gradient(to bottom, #3b82f6, #1d4ed8)',
  },
  walletLabel: {
    fontSize: 18,
    color: '#dbeafe',
  },
  walletBalance: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  suggestionCard: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  suggestionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dbeafe',
    marginBottom: 5,
  },
  suggestionMessage: {
    fontSize: 16,
    color: '#bfdbfe',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: '#a1a1aa',
    fontSize: 16,
    marginTop: 20,
    padding: 20,
  },
  habitItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 15,
  },
  habitTrend: {
      fontSize: 24,
      marginRight: 15,
  },
  habitName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  habitArea: {
      fontSize: 14,
      color: '#a1a1aa',
  },
  habitReward: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4ade80',
  },
  habitPenalty: {
    fontSize: 14,
    color: '#f87171',
  },
  analysisText: {
      marginTop: 15,
      fontSize: 14,
      color: '#93c5fd',
      fontStyle: 'italic',
      textAlign: 'center',
      whiteSpace: 'pre-wrap',
      lineHeight: 1.6,
      backgroundColor: 'rgba(23, 37, 84, 0.5)',
      padding: '10px',
      borderRadius: '8px',
  },
  costContainer: {
    backgroundColor: 'rgba(23, 37, 84, 0.5)',
    padding: '10px',
    borderRadius: '8px',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 5,
  },
  costLabel: {
    color: '#dbeafe',
    fontSize: 16,
    fontWeight: '600',
  },
  costSublabel: {
    color: '#93c5fd',
    fontSize: 12,
  },
  errorText: {
    color: '#fca5a5',
    textAlign: 'center',
    fontSize: 14,
    marginTop: 10,
  },
  trackerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackerActions: {
    display: 'flex',
  },
  actionButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0 10px',
    border: 'none',
    cursor: 'pointer',
  },
  actionButtonText: {
    fontSize: 24,
    color: '#1c1917',
    fontWeight: 'bold',
  },
  completeButton: {
    backgroundColor: '#4ade80',
  },
  missButton: {
    backgroundColor: '#f87171',
  },
  summaryContainer: {
      display: 'flex',
      justifyContent: 'space-around',
  },
  summaryBox: {
      textAlign: 'center',
  },
  summaryLabel: {
      fontSize: 16,
      color: '#a1a1aa',
  },
  summaryValue: {
      fontSize: 24,
      fontWeight: 'bold',
      marginTop: 5,
  },
  settingDescription: {
      fontSize: 14,
      color: '#a1a1aa',
      marginTop: 10,
      lineHeight: 1.4,
  },
  navigation: {
    display: 'flex',
    height: 65,
    backgroundColor: '#262626',
    borderTop: '1px solid #404040',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexShrink: 0,
  },
  navButton: {
    flex: 1,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  navText: {
    fontSize: 28,
  },
  modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      zIndex: 1000,
  },
  modalContainer: {
      width: '90%',
      maxWidth: 500,
      backgroundColor: '#262626',
      borderRadius: 16,
      padding: 20,
      border: '1px solid #404040'
  },
  modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#e5e7eb',
  },
  modalCloseButton: {
      fontSize: 18,
      color: '#a1a1aa',
      fontWeight: 'bold',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
  },
  modalText: {
      fontSize: 16,
      color: '#d4d4d8',
      lineHeight: 1.5,
  },
  // Chart Styles
  pieChart: {
      width: 150,
      height: 150,
      borderRadius: '50%',
      border: '1px solid #404040',
  },
  legendContainer: {
      marginTop: 20,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
  },
  legendItem: {
      display: 'flex',
      alignItems: 'center',
      margin: '0 10px 5px',
  },
  legendColorBox: {
      width: 14,
      height: 14,
      marginRight: 8,
      borderRadius: 3,
  },
  legendText: {
      color: '#d4d4d8',
      fontSize: 14,
  },
  barChartContainer: {
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      height: 200,
      borderLeft: '1px solid #52525b',
      borderBottom: '1px solid #52525b',
      padding: '10px 0',
  },
  barWrapper: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      height: '100%',
      justifyContent: 'flex-end',
      flex: 1,
  },
  bar: {
      width: '50%',
      borderRadius: '4px 4px 0 0',
  },
  barLabel: {
      color: '#a1a1aa',
      fontSize: 12,
      marginTop: 5,
  },
  // Calendar Styles
  calendarGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: '5px',
  },
  calendarHeader: {
      textAlign: 'center',
      fontWeight: 'bold',
      color: '#a1a1aa',
      fontSize: 14,
  },
  calendarDay: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: 35,
      borderRadius: 6,
      backgroundColor: '#404040',
      color: '#a1a1aa',
  },
  calendarDayComplete: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: 35,
      borderRadius: 6,
      backgroundColor: '#22c55e',
      color: '#14532d',
      fontWeight: 'bold',
  },
  calendarDayMissed: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: 35,
      borderRadius: 6,
      backgroundColor: '#ef4444',
      color: '#7f1d1d',
      fontWeight: 'bold',
  }
};
