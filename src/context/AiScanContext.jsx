/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useRef } from 'react';

const AiScanContext = createContext();

export const AiScanProvider = ({ children }) => {
    // Pest AI persistent state
    const [pestScanMode, setPestScanMode] = useState('auto'); // 'auto' | 'stop'
    const [pestContinuousResults, setPestContinuousResults] = useState(null);
    const [pestLiveFrameUrl, setPestLiveFrameUrl] = useState(null);
    const pestLastProcessedCycleRef = useRef(null);

    // Crop AI persistent state
    const [cropScanMode, setCropScanMode] = useState('auto'); // 'auto' | 'stop'
    const [cropContinuousResult, setCropContinuousResult] = useState(null);
    const [cropLiveFrameUrl, setCropLiveFrameUrl] = useState(null);
    const cropLastProcessedCycleRef = useRef(null);

    return (
        <AiScanContext.Provider
            value={{
                pestScanMode,
                setPestScanMode,
                pestContinuousResults,
                setPestContinuousResults,
                pestLiveFrameUrl,
                setPestLiveFrameUrl,
                pestLastProcessedCycleRef,

                cropScanMode,
                setCropScanMode,
                cropContinuousResult,
                setCropContinuousResult,
                cropLiveFrameUrl,
                setCropLiveFrameUrl,
                cropLastProcessedCycleRef
            }}
        >
            {children}
        </AiScanContext.Provider>
    );
};

export const useAiScan = () => {
    const context = useContext(AiScanContext);
    if (!context) {
        throw new Error('useAiScan must be used within an AiScanProvider');
    }
    return context;
};
