import { motion, AnimatePresence } from 'framer-motion';

type Props = {
    countdownSec: number;
};

export default function IntroCountdownText({ countdownSec }: Props) {
    return (
        <div className="relative flex items-center justify-center w-[150px] md:w-[200px] h-[150px] md:h-[200px]">
            <AnimatePresence mode="popLayout">
                <motion.div
                    key={`countdown-sec-${countdownSec}`}
                    initial={{ scale: 0.5, opacity: 0, rotate: -360 }}
                    animate={{ scale: [0.5, 1], opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{
                        duration: 0.8,
                        scale: { duration: 0.2, ease: 'easeOut' },
                        opacity: { duration: 0.3, ease: 'linear' },
                        rotate: { type: 'spring', bounce: 0.6, stiffness: 200, damping: 17 }
                    }}
                    className="absolute flex items-center justify-center"
                >
                    <span
                        className="font-hud text-[150px] md:text-[200px] leading-none text-white"
                        style={{
                            textShadow:
                                '0 0 14px rgba(37,99,235,0.9), 0 0 32px rgba(59,130,246,0.95), 0 0 56px rgba(96,165,250,0.75)'
                        }}
                    >
                        {countdownSec}
                    </span>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
