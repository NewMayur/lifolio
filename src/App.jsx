import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from "react";
import localforage from "localforage";
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import styles from "./styles.js";
import LoginScreen from "./LoginScreen";
import { onAuthStateChanged } from "firebase/auth";

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
  const [wallet, setWallet] = useState({
    balance: INITIAL_WALLET_BALANCE,
    currency: CURRENCY,
  });
  const [habits, setHabits] = useState([]);
  const [habitHistory, setHabitHistory] = useState([]); // Removed direct loading from AppStorage
  const [isLoading, setIsLoading] = useState(true); // isLoading is now managed by App component
  const [user, setUser] = useState(null); // Track authenticated user
  const [userProfile, setUserProfile] = useState({ focusArea: "" });
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // This new useEffect listens for real-time authentication changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setIsLoading(true);
      if (currentUser) {
        setUser(currentUser);
        const userId = currentUser.uid;
        const userDocRef = doc(db, "users", userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setWallet(
            data.wallet || {
              balance: INITIAL_WALLET_BALANCE,
              currency: CURRENCY,
            }
          );
          setUserProfile(data.userProfile || { focusArea: "" });
          setApiKey(data.apiKey || "");
          setHabits(data.habits || []);
          setHabitHistory(data.habitHistory || []);
        } else {
          const initialData = {
            wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY },
            userProfile: { focusArea: "" },
            apiKey: "",
            habits: [],
            habitHistory: [],
          };
          await setDoc(userDocRef, initialData);
          setWallet(initialData.wallet);
          setUserProfile(initialData.userProfile);
          setApiKey(initialData.apiKey);
          setHabits(initialData.habits);
          setHabitHistory(initialData.habitHistory);
        }
      } else {
        setUser(null);
        setWallet({ balance: INITIAL_WALLET_BALANCE, currency: CURRENCY });
        setUserProfile({ focusArea: "" });
        setHabits([]);
        setHabitHistory([]);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Persist data whenever it changes
  useEffect(() => {
    if (isLoading || !user) return; // Don't save if loading or logged out

    const saveData = async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const userId = user.uid;
        const userDocRef = doc(db, "users", userId);
        await setDoc(
          userDocRef,
          {
            wallet,
            userProfile,
            apiKey,
            habits,
            habitHistory,
          },
          { merge: true }
        );
      } catch (error) {
        setSaveError(error);
      } finally {
        setIsSaving(false);
      }
    };

    const handler = setTimeout(saveData, 500);
    return () => clearTimeout(handler);
  }, [wallet, userProfile, apiKey, habits, habitHistory, user, isLoading]);

  const updateWallet = (amount) => {
    setWallet((prev) => ({ ...prev, balance: prev.balance + amount }));
  };

  const addHabit = (habit, cost) => {
    const newHabits = [...habits, habit];
    setHabits(newHabits);
    updateWallet(-cost);
  };

  const logHabitAction = (habitId, status, change, date) => {
    setHabitHistory((prev) => {
      const existingIndex = prev.findIndex(
        (h) => h.habitId === habitId && h.date === date
      );
      if (existingIndex >= 0) {
        return prev;
      } else {
        const newLog = { habitId, date, status, change };
        updateWallet(change);
        return [...prev, newLog];
      }
    });
  };
  const resetAppData = async () => {
    if (user) {
      const initialData = {
        wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY },
        userProfile: { focusArea: "" },
        habits: [],
        habitHistory: [],
      };
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, initialData);
      setWallet(initialData.wallet);
      setUserProfile(initialData.userProfile);
      setHabits(initialData.habits);
      setHabitHistory(initialData.habitHistory);
    }
  };

  const updateHabit = (id, updatedHabit) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...updatedHabit } : h))
    );
  };

  const deleteHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setHabitHistory((prev) => prev.filter((h) => h.habitId !== id));
  };

  const archiveHabit = (id, archived = true) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, archived } : h))
    );
  };

  // All the values the rest of the app needs
  const contextValue = {
    wallet,
    habits,
    habitHistory,
    userProfile,
    setUserProfile,
    apiKey,
    setApiKey,
    addHabit,
    updateHabit,
    deleteHabit,
    archiveHabit,
    logHabitAction,
    resetAppData,
    isLoading,
    user,
    isSaving,
    saveError,
  };

  return (
    <WalletContext.Provider value={contextValue}>
            {children}   {" "}
    </WalletContext.Provider>
  );
};

// --- AI SUGGESTIONS SERVICE ---
const aiSuggestions = {
  getSuggestion: (habits, history) => {
    if (habits.length === 0) {
      return {
        title: "Get Started!",
        message: "Create your first habit to begin building a better you.",
      };
    }

    const recentHistory = history.filter((h) => {
      const daysAgo = (new Date() - new Date(h.date)) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    });

    const missedHabits = recentHistory.filter((h) => h.status === "missed");
    if (missedHabits.length > 2) {
      const mostMissed = missedHabits.reduce((acc, h) => {
        acc[h.habitId] = (acc[h.habitId] || 0) + 1;
        return acc;
      }, {});
      const topMissedId = Object.keys(mostMissed).sort(
        (a, b) => mostMissed[b] - mostMissed[a]
      )[0];
      const habit = habits.find((h) => h.id === topMissedId);
      if (habit)
        return {
          title: "Struggling?",
          message: `You've missed "${habit.name}" a few times. Consider lowering the penalty to make it less daunting.`,
        };
    }

    const completedStreaks = habits
      .map((habit) => {
        const habitHistory = recentHistory.filter(
          (h) => h.habitId === habit.id && h.status === "complete"
        );
        return { habit, count: habitHistory.length };
      })
      .filter((item) => item.count >= 3);

    if (completedStreaks.length > 0) {
      const topStreakHabit = completedStreaks.sort(
        (a, b) => b.count - a.count
      )[0].habit;
      return {
        title: "On a Roll!",
        message: `You're consistent with "${topStreakHabit.name}". Maybe it's time to increase the reward?`,
      };
    }

    return {
      title: "Stay Focused",
      message:
        "Consistency is key. Keep logging your habits daily to see progress.",
    };
  },
};

// --- UTILS ---
const cleanText = (text) =>
  text
    .replace(/\*/g, "")
    .replace(/\n\d+\.\s*/g, "\n• ")
    .replace(/^- /gm, "• ");

// --- REUSABLE UI COMPONENTS (Web Version) ---
const AppButton = ({ onClick, title, style, textStyle, disabled = false }) => (
  <button
    onClick={onClick}
    style={{
      ...styles.button,
      ...style,
      ...(disabled ? styles.disabledButton : {}),
    }}
    disabled={disabled}
  >
    <p style={{ ...styles.buttonText, ...textStyle }}>{title}</p>
  </button>
);

const Card = ({ children, style }) => (
  <div style={{ ...styles.card, ...style }}>{children}</div>
);

const CustomModal = ({ visible, onClose, children, title }) => {
  if (!visible) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>{title}</p>
          <button onClick={onClose} style={styles.modalCloseButton}>
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const CustomPieChart = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <p style={styles.emptyText}>No data for chart.</p>;

  let accumulated = 0;
  const gradients = data.map((item) => {
    const percentage = (item.count / total) * 100;
    const start = accumulated;
    accumulated += percentage;
    const end = accumulated;
    return `${item.color} ${start}% ${end}%`;
  });

  const conicGradient = `conic-gradient(${gradients.join(", ")})`;

  return (
    <div
      style={{ display: "flex", alignItems: "center", flexDirection: "column" }}
    >
      <div style={{ ...styles.pieChart, backgroundImage: conicGradient }}></div>
      <div style={styles.legendContainer}>
        {data.map((item) => (
          <div key={item.name} style={styles.legendItem}>
            <div
              style={{ ...styles.legendColorBox, backgroundColor: item.color }}
            ></div>
            <p style={styles.legendText}>
              {item.name} ({item.count})
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const CustomBarChart = ({ data }) => {
  if (!data || !data.labels || data.datasets.length === 0) {
    return <p style={styles.emptyText}>No data for chart.</p>;
  }

  const values = data.datasets[0].data;
  const maxVal = Math.max(...values.map((v) => Math.abs(v)), 1);

  return (
    <div style={styles.barChartContainer}>
      {values.map((value, index) => (
        <div key={index} style={styles.barWrapper}>
          <div
            style={{
              ...styles.bar,
              height: `${(Math.abs(value) / maxVal) * 100}%`,
              backgroundColor: value >= 0 ? "#4ade80" : "#f87171",
            }}
          ></div>
          <p
            style={{
              ...styles.barLabel,
              paddingTop: 5,
              color: "white",
              fontSize: 12,
            }}
          >
            {data.labels[index]}
            <br />
            {CURRENCY}
            {value.toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  );
};

const ProfitLossChart = ({ data, title, color, unit = "" }) => {
  if (!data.labels || data.labels.length === 0)
    return <p style={styles.emptyText}>No data for chart.</p>;

  const values = data.datasets[0].data;
  const maxVal = Math.max(...values.map((v) => Math.abs(v)), 1);

  return (
    <div style={styles.barChartContainer}>
      <h3 style={{ color: "white", textAlign: "center", marginBottom: 10 }}>
        {title}
      </h3>
      {values.map((value, index) => (
        <div key={index} style={styles.barWrapper}>
          <div
            style={{
              ...styles.bar,
              height: `${(Math.abs(value) / maxVal) * 100}%`,
              backgroundColor: color,
            }}
          ></div>
          <p
            style={{
              ...styles.barLabel,
              paddingTop: 5,
              color: "white",
              fontSize: 12,
            }}
          >
            {data.labels[index]}
            <br />
            {unit}
            {value.toFixed(2)}
          </p>
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

  const habitHistoryForMonth = history.filter((h) => {
    const hDate = new Date(h.date);
    return (
      h.habitId === habit.id &&
      hDate.getFullYear() === year &&
      hDate.getMonth() === month
    );
  });

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} style={styles.calendarDay}></div>);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const log = habitHistoryForMonth.find((h) => h.date === dateStr);
    let dayStyle = styles.calendarDay;
    if (log) {
      dayStyle =
        log.status === "complete"
          ? styles.calendarDayComplete
          : styles.calendarDayMissed;
    }
    days.push(
      <div key={day} style={dayStyle}>
        {day}
      </div>
    );
  }

  return (
    <Card>
      <p style={styles.cardTitle}>{habit.name} - Monthly Progress</p>
      <div style={styles.calendarGrid}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} style={styles.calendarHeader}>
            {day}
          </div>
        ))}
        {days}
      </div>
    </Card>
  );
};

// --- SCREENS (Web Version) ---

const OnboardingScreen = ({ onComplete }) => {
  const { setUserProfile, resetAppData } = useContext(WalletContext);
  const [step, setStep] = useState(1); // Assume start at step 1
  const [focusArea, setFocusArea] = useState("");

  const handleComplete = async () => {
    const profileData = {
      wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY },
      focusArea,
    };
    setUserProfile((prev) => ({ ...prev, focusArea })); // Update context
    await AppStorage.setItem("userProfile", JSON.stringify(profileData));
    onComplete();
  };

  return (
    <div style={styles.onboardingContainer}>
      <div style={styles.scrollContent}>
        {step === 1 && (
          <>
            <p style={styles.onboardingTitle}>Welcome to Lifefolio</p>
            <p style={styles.onboardingSubtitle}>
              Invest in yourself, literally.
            </p>
            <Card>
              <p style={styles.cardTitle}>How it works:</p>
              <p style={styles.onboardingText}>
                1. You get a starting wallet balance.
              </p>
              <p style={styles.onboardingText}>
                2. You 'invest' in habits by setting rewards & penalties.
              </p>
              <p style={styles.onboardingText}>
                3. Complete habits to earn. Miss them and you pay.
              </p>
            </Card>
            <AppButton
              title="Let's Get Started"
              onClick={() => setStep(2)}
              style={{ marginTop: 30 }}
            />
          </>
        )}
        {step === 2 && (
          <>
            <p style={styles.onboardingTitle}>Your Starting Capital</p>
            <p style={styles.onboardingSubtitle}>
              We're giving you {CURRENCY}
              {INITIAL_WALLET_BALANCE} to start your journey.
            </p>
            <Card>
              <p style={styles.cardTitle}>What's your primary focus?</p>
              <input
                style={styles.input}
                placeholder="e.g., Health, Career, Learning"
                value={focusArea}
                onChange={(e) => setFocusArea(e.target.value)}
              />
            </Card>
            <AppButton
              title="Complete Setup"
              onClick={handleComplete}
              disabled={!focusArea}
              style={{ marginTop: 30 }}
            />
          </>
        )}
      </div>
    </div>
  );
};

const DashboardScreen = ({ navigate }) => {
  const { wallet, habits, habitHistory, apiKey, isLoading } =
    useContext(WalletContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);

  if (isLoading === undefined || isLoading) {
    return (
      <div style={styles.container}>
        <p style={styles.title}>Loading...</p>
      </div>
    );
  }

  // Ensure habits and habitHistory are proper arrays
  const safeHabits = Array.isArray(habits) ? habits : [];
  const safeHabitHistory = Array.isArray(habitHistory) ? habitHistory : [];

  // Overall performance from reports
  const earningsData = safeHabitHistory.reduce(
    (acc, h) => {
      const change = Number(h?.change) || 0;
      if (change > 0) acc.earnings += change;
      else if (change < 0) acc.losses += Math.abs(change);
      return acc;
    },
    { earnings: 0, losses: 0 }
  );

  const areaDistribution = safeHabits.reduce((acc, h) => {
    const area = h?.area || "Uncategorized";
    if (!acc[area]) {
      acc[area] = {
        name: area,
        count: 0,
        color: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0")}`,
      };
    }
    acc[area].count++;
    return acc;
  }, {});

  const pieChartData = Object.values(areaDistribution);

  const lossesByArea = safeHabits.reduce((acc, h) => {
    const area = h?.area || "Uncategorized";
    const habitLosses = safeHabitHistory.filter(hist => hist.habitId === h.id && hist.change < 0).reduce((sum, hist) => sum + Math.abs(hist.change), 0);
    if (!acc[area]) {
      acc[area] = {
        name: area,
        count: 0,
        color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
      };
    }
    acc[area].count += habitLosses;
    return acc;
  }, {});

  const lossesPieData = Object.values(lossesByArea).filter(item => item.count > 0);

  const profitLossPerHabit = safeHabits.map((habit) => {
    const historyForHabit = safeHabitHistory.filter(
      (h) => h?.habitId === habit?.id
    );
    const total = historyForHabit.reduce(
      (sum, h) => sum + (Number(h?.change) || 0),
      0
    );
    const missedCount = historyForHabit.filter(
      (h) => h?.status === "missed"
    ).length;
    return { name: habit?.name || "Unknown", total, missedCount };
  });

  const barChartData = {
    labels: profitLossPerHabit.map((h) => h.name.substring(0, 5)),
    datasets: [
      {
        data: profitLossPerHabit.map((h) => h.total),
      },
    ],
  };

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    setSummaryModalVisible(true);
    setSummary("✨ Analyzing your week with Gemini...");

    const prompt = `Here is my habit data for the last 7 days: ${JSON.stringify(
      habitHistory
    )}. My habits are: ${JSON.stringify(
      habits
    )}. Please provide a concise, encouraging, and actionable weekly summary. Identify my strongest habit and my biggest challenge. Offer one specific tip for improvement. Keep it under 150 words.`;

    if (!apiKey || apiKey.trim() === "") {
      setSummary("Please set your Gemini API key in Settings first.");
      setIsGenerating(false);
      return;
    }

    let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.candidates && result.candidates.length > 0) {
        setSummary(result.candidates[0].content.parts[0].text);
      } else {
        setSummary(
          "Could not generate a summary at this time. Check your API key."
        );
      }
    } catch (error) {
      console.error("Gemini summary failed:", error);
      setSummary("Error connecting to the AI for your summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={{ ...styles.headerTitle, color: "#ffffffff" }}>Dashboard</p>

        <Card style={{ marginBottom: 15, padding: 15 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  color: "#f0f9ff",
                  marginBottom: 0,
                }}
              >
                ₹{wallet.balance.toFixed(2)}
              </p>
              <p style={{ fontSize: 12, color: "#ffffffff", marginTop: 0 }}>
                Balance
              </p>
            </div>
          </div>
        </Card>

        <Card style={{ marginBottom: 15 }}>
          <p style={styles.cardTitle}>Overall Performance</p>
          <div style={styles.summaryContainer}>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Earnings</p>
              <p style={{ ...styles.summaryValue, color: "#4ade80" }}>
                {CURRENCY}
                {earningsData.earnings.toFixed(2)}
              </p>
            </div>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Losses</p>
              <p style={{ ...styles.summaryValue, color: "#f87171" }}>
                {CURRENCY}
                {earningsData.losses.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        <div
          style={{ ...styles.sectionHeader, marginTop: 10, marginBottom: 15 }}
        >
          <AppButton
            title="✨ Generate Weekly Summary"
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            style={{ backgroundColor: "#581c87", padding: "5px 10px" }}
          />
        </div>

        {pieChartData.length > 0 && (
          <Card style={{ marginBottom: 15 }}>
            <p style={styles.cardTitle}>Habit Area Distribution</p>
            <CustomPieChart data={pieChartData} />
          </Card>
        )}

        {lossesPieData.length > 0 && (
          <Card style={{ marginBottom: 15 }}>
            <p style={styles.cardTitle}>Losses by Habit Area</p>
            <CustomPieChart data={lossesPieData} />
          </Card>
        )}

        {profitLossPerHabit.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {/* Separate chart for profits */}
            {profitLossPerHabit.filter((h) => h.total > 0).length > 0 && (
              <Card>
                <p style={styles.cardTitle}>Profits per Habit</p>
                <ProfitLossChart
                  data={{
                    labels: profitLossPerHabit
                      .filter((h) => h.total > 0)
                      .map((h) => h.name.substring(0, 5)),
                    datasets: [
                      {
                        data: profitLossPerHabit
                          .filter((h) => h.total > 0)
                          .map((h) => h.total),
                      },
                    ],
                  }}
                  color="#4ade80"
                />
              </Card>
            )}

            {/* Separate chart for losses */}
            {profitLossPerHabit.filter((h) => h.missedCount > 0).length > 0 && (
              <Card>
                <p style={styles.cardTitle}>Missed Habits</p>
                <ProfitLossChart
                  data={{
                    labels: profitLossPerHabit
                      .filter((h) => h.missedCount > 0)
                      .map((h) => h.name.substring(0, 5)),
                    datasets: [
                      {
                        data: profitLossPerHabit
                          .filter((h) => h.missedCount > 0)
                          .map((h) => h.missedCount),
                      },
                    ],
                  }}
                  color="#f87171"
                />
              </Card>
            )}
          </div>
        )}

        {habits.length > 0 &&
          habits.map((habit) => (
            <HabitCalendar
              key={habit.id}
              habit={habit}
              history={habitHistory}
            />
          ))}
      </div>
      <CustomModal
        visible={summaryModalVisible}
        onClose={() => setSummaryModalVisible(false)}
        title="✨ Your AI-Powered Weekly Summary"
      >
        <p style={{ ...styles.modalText, whiteSpace: "normal" }}>
          {cleanText(summary)}
        </p>
        <AppButton
          title="Close"
          onClick={() => setSummaryModalVisible(false)}
          disabled={isGenerating}
          style={{ marginTop: 15 }}
        />
      </CustomModal>
    </div>
  );
};

const HabitsScreen = ({ navigate }) => {
  const {
    habits,
    habitHistory,
    updateHabit,
    deleteHabit,
    archiveHabit,
    logHabitAction,
    isSaving,
  } = useContext(WalletContext);
  const [editHabit, setEditHabit] = useState(null);
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editReward, setEditReward] = useState("");
  const [editPenalty, setEditPenalty] = useState("");
  const [todayHabits, setTodayHabits] = useState([]);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const loggedTodayIds = habitHistory
      .filter((h) => h.date === todayStr)
      .map((h) => h.habitId);
    setTodayHabits(
      habits.filter((h) => !loggedTodayIds.includes(h.id) && !h.archived)
    );
  }, [habits, habitHistory]);

  const getHabitTrend = (habitId) => {
    const today = new Date();
    const recentHistory = habitHistory.filter((h) => {
      const hDate = new Date(h.date);
      const diffDays = (today - hDate) / (1000 * 60 * 60 * 24);
      return h.habitId === habitId && diffDays <= 7;
    });
    const completed = recentHistory.filter(
      (h) => h.status === "complete"
    ).length;
    const missed = recentHistory.filter((h) => h.status === "missed").length;
    if (completed > missed) return "🟢";
    if (missed > completed) return "🔴";
    return "⚪️";
  };

  const handleEdit = (habit) => {
    setEditHabit(habit);
    setEditName(habit.name);
    setEditArea(habit.area || "");
    setEditReward(habit.reward.toString());
    setEditPenalty(habit.penalty.toString());
  };

  const handleSaveEdit = () => {
    const updated = {
      name: editName,
      area: editArea,
      reward: parseFloat(editReward),
      penalty: parseFloat(editPenalty),
    };
    updateHabit(editHabit.id, updated);
    setEditHabit(null);
  };

  const handleDelete = (id) => {
    if (confirm("Delete this habit and all its history?")) {
      deleteHabit(id);
    }
  };

  const handleArchive = (id, archived) => {
    archiveHabit(id, archived);
  };

  const handleAction = (habit, status) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const change = status === "complete" ? habit.reward : -habit.penalty;
    logHabitAction(habit.id, status, change, todayStr);
  };

  const activeHabits = habits.filter((h) => !h.archived);
  const archivedHabits = habits.filter((h) => h.archived);

  const calculateHabitProfit = (habitId) => {
    const history = habitHistory.filter((h) => h.habitId === habitId);
    return history.reduce((sum, h) => sum + h.change, 0);
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>My Habits</p>

        <div
          style={{ ...styles.sectionHeader, marginTop: 20, marginBottom: 10 }}
        >
          <AppButton
            title="+ New Habit"
            onClick={() => navigate("CreateHabit")}
            style={styles.smallButton}
            textStyle={styles.smallButtonText}
          />
        </div>

        {/* Active Habits with merged list/tracker layout */}
        {activeHabits.length === 0 ? (
          <p style={styles.emptyText}>
            No active habits. Create your first habit!
          </p>
        ) : (
          activeHabits.map((habit) => {
            const todayStr = new Date().toISOString().split("T")[0];
            const isLoggedToday = habitHistory.some(
              (h) => h.habitId === habit.id && h.date === todayStr
            );
            // const profitLoss = calculateHabitProfit(habit.id);
            return (
              <Card
                key={habit.id}
                style={{ marginBottom: 12, borderRadius: 12 }}
              >
                {/* First Row: Clickable Habit Name */}
                <div
                  style={{
                    cursor: "pointer",
                    padding: "12px",
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "#ffffff",
                  }}
                  onClick={() => handleEdit(habit)}
                >
                  {getHabitTrend(habit.id)} {habit.name} ({habit.area})
                  <p
                    style={{
                      fontSize: 12,
                      color: "#a1a1aa",
                      margin: "4px 0 0 0",
                    }}
                  ></p>
                </div>

                {/* Second Row: Profit/Loss on left, Tracker on right */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderTop: "1px solid #404040",
                  }}
                >
                  <div style={{ display: "flex", gap: 12 }}>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#4ade80",
                      }}
                    >
                      + {habit.reward}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#f87171",
                      }}
                    >
                      - {habit.penalty}
                    </div>
                  </div>

                  {!isLoggedToday && (
                    <div style={styles.trackerActions}>
                      <button
                        style={{
                          ...styles.actionButton,
                          ...styles.completeButton,
                        }}
                        onClick={() => handleAction(habit, "complete")}
                        disabled={isSaving}
                      >
                        <span style={styles.actionButtonText}>✓</span>
                      </button>
                      <button
                        style={{ ...styles.actionButton, ...styles.missButton }}
                        onClick={() => handleAction(habit, "missed")}
                      >
                        <span style={styles.actionButtonText}>✕</span>
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}

        {/* Archived Habits Section */}
        {archivedHabits.length > 0 && (
          <>
            <Card style={{ marginTop: 30, marginBottom: 15 }}>
              <p style={{ ...styles.cardTitle, color: "#9ca3af" }}>
                Archived Habits
              </p>
              {archivedHabits.map((habit) => {
                const profitLoss = calculateHabitProfit(habit.id);
                return (
                  <div
                    key={habit.id}
                    style={{
                      marginBottom: 10,
                      padding: "8px",
                      borderRadius: 8,
                      backgroundColor: "#374151",
                      color: "#9ca3af",
                    }}
                  >
                    <div style={{ fontSize: 14 }}>
                      {habit.name} ({habit.area})
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: profitLoss >= 0 ? "#4ade80" : "#f87171",
                        }}
                      >
                        Total: ${profitLoss >= 0 ? "+" : ""}
                        {profitLoss.toFixed(2)}
                      </span>
                      <AppButton
                        title="Unarchive"
                        onClick={() => handleArchive(habit.id, false)}
                        style={{
                          backgroundColor: "#374151",
                          padding: "4px 8px",
                          fontSize: 12,
                        }}
                        textStyle={{ fontSize: 12 }}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>
          </>
        )}
      </div>

      {/* Habit Modal with Edit/Delete/Archive */}
      <CustomModal
        visible={editHabit !== null}
        onClose={() => setEditHabit(null)}
        title="Habit Options"
      >
        <Card style={{ marginBottom: 15 }}>
          <p style={{ ...styles.label, marginBottom: 8 }}>Habit Name</p>
          <input
            style={styles.input}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <p style={{ ...styles.label, marginBottom: 8, marginTop: 15 }}>
            Area of Life
          </p>
          <input
            style={styles.input}
            value={editArea}
            onChange={(e) => setEditArea(e.target.value)}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 15,
            }}
          >
            <div style={{ flex: 1, marginRight: 8 }}>
              <p style={styles.label}>Reward ({CURRENCY})</p>
              <input
                style={styles.input}
                type="number"
                value={editReward}
                onChange={(e) => setEditReward(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, marginLeft: 8 }}>
              <p style={styles.label}>Penalty ({CURRENCY})</p>
              <input
                style={styles.input}
                type="number"
                value={editPenalty}
                onChange={(e) => setEditPenalty(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <AppButton
            title="Save Changes"
            onClick={handleSaveEdit}
            style={{ backgroundColor: "#2563eb", flex: 1, marginRight: 8 }}
          />
          <AppButton
            title="Archive Habit"
            onClick={() => {
              handleArchive(editHabit.id, true);
              setEditHabit(null);
            }}
            style={{ backgroundColor: "#f59e0b", flex: 1, marginRight: 8 }}
          />
          <AppButton
            title="Delete Habit"
            onClick={() => handleDelete(editHabit.id)}
            style={{ backgroundColor: "#ef4444", flex: 1 }}
          />
        </div>
      </CustomModal>
    </div>
  );
};

const CreateHabitScreen = ({ navigate }) => {
  const { wallet, addHabit, userProfile, isSaving } = useContext(WalletContext);
  const [name, setName] = useState("");
  const [area, setArea] = useState(userProfile.focusArea || "");
  const [reward, setReward] = useState("");
  const [penalty, setPenalty] = useState("");
  const [creationCost, setCreationCost] = useState(35);

  useEffect(() => {
    const r = parseFloat(reward) || 0;
    const p = parseFloat(penalty) || 0;
    // Base cost: 10% of reward + 5% of penalty, with a minimum of 5.
    const baseCost = Math.max(5, r * 0.1 + p * 0.05);
    // Final investment cost is 7 times the base cost (a week's worth).
    const finalCost = baseCost * 7;
    setCreationCost(finalCost);
  }, [reward, penalty]);

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
      archived: false,
    };
    addHabit(newHabit, creationCost);
    navigate("Habits");
  };

  const canAfford = wallet.balance >= creationCost;
  const isFormValid =
    name &&
    area &&
    reward &&
    penalty &&
    parseFloat(reward) >= 0 &&
    parseFloat(penalty) >= 0 &&
    canAfford;

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Create New Habit</p>

        <Card>
          <p style={styles.label}>Habit Name</p>
          <input
            style={styles.input}
            placeholder="e.g., Morning Workout"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <p style={styles.label}>Area of Life</p>
          <input
            style={styles.input}
            placeholder="e.g., Health"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ flex: 1, marginRight: 8 }}>
              <p style={styles.label}>Reward ({CURRENCY})</p>
              <input
                style={styles.input}
                type="number"
                placeholder="50"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, marginLeft: 8 }}>
              <p style={styles.label}>Penalty ({CURRENCY})</p>
              <input
                style={styles.input}
                type="number"
                placeholder="20"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.costContainer}>
            <p style={styles.costLabel}>
              1-Week Investment Cost: {CURRENCY}
              {creationCost.toFixed(2)}
            </p>
            <p style={styles.costSublabel}>(non-refundable)</p>
          </div>
          {!canAfford && (
            <p style={styles.errorText}>
              Insufficient funds. Your balance is {CURRENCY}
              {wallet.balance.toFixed(2)}.
            </p>
          )}
        </Card>

        <AppButton
          title="Create Habit"
          onClick={handleCreate}
          disabled={!isFormValid || isSaving}
          style={{ marginTop: 20 }}
        />
      </div>
    </div>
  );
};

const DailyTrackerScreen = ({ navigate }) => {
  const { habits, habitHistory, logHabitAction, isSaving } =
    useContext(WalletContext);
  const [todayHabits, setTodayHabits] = useState([]);
  const [aiHint, setAiHint] = useState("");
  const [showHintModal, setShowHintModal] = useState(false);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const loggedTodayIds = habitHistory
      .filter((h) => h.date === todayStr)
      .map((h) => h.habitId);

    setTodayHabits(habits.filter((h) => !loggedTodayIds.includes(h.id)));
  }, [habits, habitHistory]);

  const handleAction = (habit, status) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const change = status === "complete" ? habit.reward : -habit.penalty;
    logHabitAction(habit.id, status, change, todayStr);

    if (status === "missed") {
      setAiHint(
        `Skipping "${habit.name}" can set you back. Consider if the penalty is high enough to motivate you next time.`
      );
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
          todayHabits.map((item) => (
            <Card
              key={item.id}
              style={{
                ...styles.trackerItem,
                marginBottom: 10,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ flex: 1, fontWeight: "bold" }}>
                  {item.name} ({item.area})
                </span>
                <div style={styles.trackerActions}>
                  <button
                    style={{ ...styles.actionButton, ...styles.completeButton }}
                    onClick={() => handleAction(item, "complete")}
                    disabled={isSaving}
                  >
                    <span style={styles.actionButtonText}>✓</span>
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.missButton }}
                    onClick={() => handleAction(item, "missed")}
                  >
                    <span style={styles.actionButtonText}>✕</span>
                  </button>
                </div>
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
        <AppButton
          title="Got it"
          onClick={() => setShowHintModal(false)}
          style={{ marginTop: 15 }}
        />
      </CustomModal>
    </div>
  );
};

const ReportsScreen = ({ navigate }) => {
  const { habits, habitHistory, apiKey, isSaving } = useContext(WalletContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    setSummaryModalVisible(true);
    setSummary("✨ Analyzing your week with Gemini...");

    const prompt = `Here is my habit data for the last 7 days: ${JSON.stringify(
      habitHistory
    )}. My habits are: ${JSON.stringify(
      habits
    )}. Please provide a concise, encouraging, and actionable weekly summary. Identify my strongest habit and my biggest challenge. Offer one specific tip for improvement. Keep it under 150 words.`;

    if (!apiKey || apiKey.trim() === "") {
      setSummary("Please set your Gemini API key in Settings first.");
      setIsGenerating(false);
      return;
    }

    let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.candidates && result.candidates.length > 0) {
        setSummary(result.candidates[0].content.parts[0].text);
      } else {
        setSummary(
          "Could not generate a summary at this time. Check your API key."
        );
      }
    } catch (error) {
      console.error("Gemini summary failed:", error);
      setSummary("Error connecting to the AI for your summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  const earningsData = habitHistory.reduce(
    (acc, h) => {
      if (h.change > 0) acc.earnings += h.change;
      else acc.losses += Math.abs(h.change);
      return acc;
    },
    { earnings: 0, losses: 0 }
  );

  const areaDistribution = habits.reduce((acc, h) => {
    const area = h.area || "Uncategorized";
    if (!acc[area]) {
      acc[area] = {
        name: area,
        count: 0,
        color: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0")}`,
      };
    }
    acc[area].count++;
    return acc;
  }, {});

  const pieChartData = Object.values(areaDistribution);

  const profitLossPerHabit = habits.map((habit) => {
    const historyForHabit = habitHistory.filter((h) => h.habitId === habit.id);
    const total = historyForHabit.reduce((sum, h) => sum + h.change, 0);
    return { name: habit.name, total };
  });

  const barChartData = {
    labels: profitLossPerHabit.map((h) => h.name.substring(0, 5)),
    datasets: [
      {
        data: profitLossPerHabit.map((h) => h.total),
      },
    ],
  };
  // Add loading indicator for reports if needed
  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <div style={styles.sectionHeader}>
          <p style={styles.headerTitle}>Reports & Insights</p>
          <AppButton
            title="✨ Weekly Summary"
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            style={{ backgroundColor: "#581c87" }}
          />
        </div>

        <Card>
          <p style={styles.cardTitle}>Overall Performance</p>
          <div style={styles.summaryContainer}>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Earnings</p>
              <p style={{ ...styles.summaryValue, color: "#4ade80" }}>
                {CURRENCY}
                {earningsData.earnings.toFixed(2)}
              </p>
            </div>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Losses</p>
              <p style={{ ...styles.summaryValue, color: "#f87171" }}>
                {CURRENCY}
                {earningsData.losses.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        {habits.map((habit) => (
          <HabitCalendar key={habit.id} habit={habit} history={habitHistory} />
        ))}

        {pieChartData.length > 0 && (
          <Card>
            <p style={styles.cardTitle}>Habit Area Distribution</p>
            <CustomPieChart data={pieChartData} />
          </Card>
        )}

        {profitLossPerHabit.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {/* Separate chart for profits */}
            {profitLossPerHabit.filter((h) => h.total > 0).length > 0 && (
              <Card>
                <p style={styles.cardTitle}>Profits per Habit</p>
                <ProfitLossChart
                  data={{
                    labels: profitLossPerHabit
                      .filter((h) => h.total > 0)
                      .map((h) => h.name.substring(0, 5)),
                    datasets: [
                      {
                        data: profitLossPerHabit
                          .filter((h) => h.total > 0)
                          .map((h) => h.total),
                      },
                    ],
                  }}
                  title="Profits"
                  color="#4ade80"
                />
              </Card>
            )}

            {/* Separate chart for losses */}
            {profitLossPerHabit.filter((h) => h.total < 0).length > 0 && (
              <Card>
                <p style={styles.cardTitle}>Losses per Habit</p>
                <ProfitLossChart
                  data={{
                    labels: profitLossPerHabit
                      .filter((h) => h.total < 0)
                      .map((h) => h.name.substring(0, 5)),
                    datasets: [
                      {
                        data: profitLossPerHabit
                          .filter((h) => h.total < 0)
                          .map((h) => Math.abs(h.total)),
                      },
                    ],
                  }}
                  title="Losses"
                  color="#f87171"
                />
              </Card>
            )}
          </div>
        )}
      </div>
      <CustomModal
        visible={summaryModalVisible}
        onClose={() => setSummaryModalVisible(false)}
        title="✨ Your AI-Powered Weekly Summary"
      >
        <p style={{ ...styles.modalText, whiteSpace: "normal" }}>
          {cleanText(summary)}
        </p>
        <AppButton
          title="Close"
          onClick={() => setSummaryModalVisible(false)}
          disabled={isGenerating}
          style={{ marginTop: 15 }}
        />
      </CustomModal>
    </div>
  );
};

const SettingsScreen = ({ navigate, onReset }) => {
  const {
    apiKey,
    setApiKey,
    resetAppData,
    habits,
    logHabitAction,
    habitHistory,
  } = useContext(WalletContext);
  const [newApiKey, setNewApiKey] = useState(apiKey);

  const handleSaveApiKey = () => {
    setApiKey(newApiKey);
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Settings</p>

        <Card>
          <p style={styles.cardTitle}>AI API Configuration</p>
          <p style={styles.label}>Gemini API Key</p>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter your API key"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
          />
          <AppButton
            title="Save API Key"
            onClick={handleSaveApiKey}
            style={{ marginTop: 10, padding: "5px 10px" }}
          />
          <p style={styles.settingDescription}>
            Required for AI features like habit suggestions and analysis. Get
            your free API key from Google AI Studio.
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
    </div>
  );
};

// --- MAIN APP CONTAINER ---

const AppContent = () => {
  // State for tracking the current screen (e.g., 'Dashboard', 'Onboarding')
  const [currentScreen, setCurrentScreen] = useState("Loading");

  // Get all necessary values from our context
  const { isLoading, userProfile, user, habits, habitHistory, logHabitAction } =
    useContext(WalletContext);

  // The AutoMissHandler component checks for missed habits for all past days.
  // It's defined here because it needs access to the context.
  const AutoMissHandler = () => {
    useEffect(() => {
      if (isLoading || habits.length === 0 || !user) return;

      const runAutoMiss = async () => {
        const userId = user.uid;
        const userDocRef = doc(db, "users", userId);
        const docSnap = await getDoc(userDocRef);
        const userData = docSnap.data() || {};

        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        // Get the last processed date from Firestore (stored as string)
        // If null, find the earliest date we need to process
        let lastProcessedDate = userData.lastAutoProcessedDateStr;

        if (!lastProcessedDate) {
          // If no last processed date, find the max date in history or earliest habit creation -1 day
          const maxHistoryDate =
            habitHistory.length > 0
              ? habitHistory.reduce(
                  (max, h) => (h.date > max ? h.date : max),
                  "2000-01-01"
                )
              : yesterdayStr;
          const earliestHabitDate =
            habits.length > 0
              ? habits.reduce((min, h) => {
                  const hDate = new Date(h.createdOn)
                    .toISOString()
                    .split("T")[0];
                  return hDate < min ? hDate : min;
                }, maxHistoryDate)
              : maxHistoryDate;
          lastProcessedDate = earliestHabitDate; // Will process from this date onwards
        }

        // If already processed up to yesterday, nothing to do
        if (lastProcessedDate >= yesterdayStr) {
          console.log("Auto-miss is up to date.");
          return;
        }

        console.log(
          `Auto-miss processing from ${lastProcessedDate} to ${yesterdayStr}`
        );

        // Generate all dates from lastProcessedDate + 1 to yesterday
        const startDate = new Date(lastProcessedDate);
        startDate.setDate(startDate.getDate() + 1); // Next day after last processed
        const datesToProcess = [];
        for (
          let d = new Date(startDate);
          d <= yesterday;
          d.setDate(d.getDate() + 1)
        ) {
          datesToProcess.push(d.toISOString().split("T")[0]);
        }

        // For each date to process
        for (const dateStr of datesToProcess) {
          // For each active habit on this date (not archived)
          habits.forEach((habit) => {
            const habitStartDate = new Date(habit.createdOn)
              .toISOString()
              .split("T")[0];
            if (habitStartDate <= dateStr && !habit.archived) {
              const loggedOnDate = habitHistory.some(
                (h) => h.habitId === habit.id && h.date === dateStr
              );
              if (!loggedOnDate) {
                console.log(`Auto-missing habit: ${habit.name} for ${dateStr}`);
                logHabitAction(habit.id, "missed", -habit.penalty, dateStr);
              }
            }
          });
        }

        // Update the last processed date to yesterday
        await setDoc(
          userDocRef,
          { lastAutoProcessedDateStr: yesterdayStr },
          { merge: true }
        );
        console.log("Auto-miss processing completed.");
      };

      runAutoMiss();
    }, [isLoading, habits, habitHistory, logHabitAction, user]);
    return null; // This component doesn't render anything
  };

  // This useEffect is responsible for deciding which screen to show after login.
  useEffect(() => {
    if (!isLoading && user) {
      if (userProfile && userProfile.focusArea) {
        setCurrentScreen("Dashboard");
      } else {
        setCurrentScreen("Onboarding");
      }
    }
  }, [user, isLoading, userProfile]);

  // Helper functions for navigation within the app.
  const navigate = (screen) => setCurrentScreen(screen);
  const handleReset = () => {
    setCurrentScreen("Onboarding");
  };

  // --- Main Render Logic ---

  // 1. Show a loading screen while Firebase is initializing.
  // 2. While loading, if we have a cached user show Dashboard, otherwise show login
  if (isLoading) {
    // While loading, show appropriate screen if we have stored data
    // This prevents login screen flash
    return (
      <div style={styles.container}>
        <p style={styles.title}>Loading...</p>
      </div>
    );
  }

  // If loading is done and there's no user, show the Login screen.
  if (!user) {
    return <LoginScreen />;
  }

  // 3. If we have a user, render the correct screen from the main app.
  const renderMainApp = () => {
    switch (currentScreen) {
      case "Onboarding":
        return <OnboardingScreen onComplete={() => navigate("Dashboard")} />;
      case "Dashboard":
        return <DashboardScreen navigate={navigate} />;
      case "Habits":
        return <HabitsScreen navigate={navigate} />;
      case "CreateHabit":
        return <CreateHabitScreen navigate={navigate} />;
      case "Settings":
        return <SettingsScreen navigate={navigate} onReset={handleReset} />;
      default:
        // A fallback loading screen while currentScreen is being set.
        return (
          <div style={styles.container}>
            <p style={styles.title}>Loading screen...</p>
          </div>
        );
    }
  };

  return (
    <div style={styles.appContainer}>
      <AutoMissHandler />
      <div>{renderMainApp()}</div>
      {/* Navigation bar, visible only on the main app screens */}
      {currentScreen !== "Onboarding" && currentScreen !== "Loading" && (
        <div style={styles.navigation}>
          <button
            style={styles.navButton}
            onClick={() => navigate("Dashboard")}
          >
            <span style={styles.navText}>📊</span>
          </button>
          <button style={styles.navButton} onClick={() => navigate("Habits")}>
            <span style={styles.navText}>📆</span>
          </button>
          <button style={styles.navButton} onClick={() => navigate("Settings")}>
            <span style={styles.navText}>⚙️</span>
          </button>
        </div>
      )}
    </div>
  );
};

// The final export statement for the App component.
export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
