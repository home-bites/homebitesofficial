import React from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import Container from '../common/Container';
import Badge from '../common/Badge';
import BackgroundEffects from './BackgroundEffects';
import appScreenHero from '../assets/app_screen_hero.webp';
import foodPlate from '../assets/food_plate.webp';
import quickInfo from '../assets/quick_info.webp';

const Hero = () => {
  // Fade-in-up variants for clean entrance
  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (custom = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, delay: custom * 0.15, ease: [0.16, 1, 0.3, 1] }
    })
  };

  return (
    <section id="home" className="relative min-h-screen flex flex-col justify-center pt-44 md:pt-56 lg:pt-64 pb-16 overflow-hidden">
      {/* Background with luxury green glows and floating particles */}
      <BackgroundEffects variant="hero" />

      <Container className="relative z-10 flex-grow flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-0 items-center w-full">
          
          {/* Left Text Column - Width 5 columns */}
          <div className="col-span-1 lg:col-span-5 flex flex-col items-start text-left justify-center gap-6">
            <motion.div
              custom={0}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
            >
              <Badge variant="glass-green" className="uppercase tracking-widest text-xs font-bold px-4 py-1.5">
                ✦ Fresh Food. Fast Delivery. Great Mood.
              </Badge>
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight text-white leading-tight"
            >
              Food for Every <br />
              <span className="text-brand-secondary">Lifestyle</span>
            </motion.h1>

            <motion.div
              custom={2}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-2 text-lg md:text-xl text-brand-offwhite/95 leading-relaxed font-sans max-w-lg"
            >
              <p className="font-semibold text-brand-secondary">Fresh. Healthy. Delicious.</p>
              <p className="text-brand-offwhite/80 text-base md:text-lg">Delivered straight to your doorstep from your favorite local kitchens.</p>
            </motion.div>

            {/* CTAs Stacked Vertically for Perfect Left Edge Alignment */}
            <motion.div
              custom={3}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-start gap-5 w-full sm:w-auto"
            >
              {/* Coming Soon Button */}
              <div className="relative group">
                <button 
                  disabled
                  className="relative px-8 py-4 bg-brand-secondary text-brand-primary font-display font-extrabold text-base md:text-lg tracking-wider rounded-xl cursor-not-allowed opacity-90 border border-brand-secondary/35 flex items-center gap-3 shadow-lg select-none"
                >
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-primary"></span>
                  </span>
                  COMING SOON
                </button>
              </div>

              {/* Play Store Button */}
              <Button variant="playstore" className="scale-100" />

              {/* App Store Button */}
              <Button variant="appstore" className="scale-100" />
              
              {/* Launching Soon Text */}
              <span className="text-xs tracking-widest uppercase text-brand-offwhite/40 font-bold ml-1 font-display mt-2 block">
                Launching Soon • Stay Tuned
              </span>
            </motion.div>
          </div>

          {/* Right Mockup Composition Column - Width 6 columns, offset by 1 column */}
          <div className="col-span-1 lg:col-span-6 lg:col-start-7 relative flex justify-center items-center min-h-[550px]">
            {/* 3D Phone Mockup Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              className="relative z-10 w-[270px] h-[550px] rounded-[40px] bg-black p-3.5 shadow-2xl border-4 border-white/10"
            >
              {/* Phone Speaker & Camera Notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-6 w-32 bg-black rounded-b-2xl z-20 flex items-center justify-center gap-1.5">
                <div className="w-12 h-1 bg-gray-800 rounded-full" />
                <div className="w-3.5 h-3.5 bg-gray-950 border border-gray-800 rounded-full" />
              </div>

              {/* Inside Screen Content Frame */}
              <div className="w-full h-full rounded-[28px] overflow-hidden bg-brand-primary relative select-none">
                <img 
                  src={appScreenHero} 
                  alt="HomeBites App Screenshot" 
                  className="w-full h-full object-cover rounded-[28px]"
                />
              </div>
            </motion.div>

            {/* Context Card 1: Live Order status (Floating Left) */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-[-20px] md:left-[30px] top-[15%] z-20 glass-card p-4 rounded-2xl w-[170px] text-left select-none shadow-glass"
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-2.5 h-2.5 bg-brand-secondary rounded-full" />
                <span className="text-[10px] font-bold text-brand-secondary tracking-wider uppercase">Live Order</span>
              </div>
              <h4 className="text-xs font-bold text-white">Order Confirmed</h4>
              <p className="text-[9px] text-brand-offwhite/60 mt-0.5">2 mins ago</p>
            </motion.div>

            {/* Context Card 2: Estimated Delivery time (Floating Right) */}
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute right-[-20px] md:right-[30px] top-[40%] z-20 glass-card p-4 rounded-2xl w-[170px] text-left select-none shadow-glass"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">⏱️</span>
                <span className="text-[10px] font-bold text-brand-secondary tracking-wider uppercase">Est. Delivery</span>
              </div>
              <h4 className="text-xs font-bold text-white">30 - 35 min</h4>
              <p className="text-[9px] text-brand-offwhite/60 mt-0.5">Rider is on the way</p>
            </motion.div>

            {/* Context Card 3: Wallet (Floating Bottom-Left) */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              className="absolute left-[-15px] md:left-[45px] bottom-[15%] z-20 glass-card p-4 rounded-2xl w-[160px] text-left select-none shadow-glass"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">💳</span>
                <span className="text-[10px] font-bold text-brand-secondary tracking-wider uppercase">My Wallet</span>
              </div>
              <h4 className="text-xs font-bold text-white">₹450.00</h4>
              <p className="text-[9px] text-brand-offwhite/60 mt-0.5">Balance active</p>
            </motion.div>

            {/* Floating food plate asset behind everything */}
            <motion.img
              src={foodPlate}
              alt="Premium food plate"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute right-[-30px] bottom-[5%] w-[180px] h-[180px] object-contain opacity-85 z-0 pointer-events-none hidden md:block"
            />
          </div>

        </div>
      </Container>

      {/* Quick Info Bar below the fold (Styled with glassmorphism matching continuous green theme) */}
      {/* Quick Info Bar below the fold (Rendering the premium cards illustration image) */}
      <div className="relative z-10 w-full mt-16 lg:mt-24 px-6">
        <Container className="flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border border-white/5"
          >
            <img 
              src={quickInfo} 
              alt="HomeBites Quick Info Features" 
              className="w-full object-contain pointer-events-none"
            />
          </motion.div>
        </Container>
      </div>

    </section>
  );
};

export default Hero;
