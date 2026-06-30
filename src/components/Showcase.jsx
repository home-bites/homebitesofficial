import React from 'react';
import { motion } from 'framer-motion';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import appScreen from '../assets/app_screen.webp';
import foodPlate from '../assets/food_plate.webp';
import deliveryBag from '../assets/delivery_bag.webp';
import cloche from '../assets/cloche.webp';

const Showcase = () => {
  return (
    <section id="showcase" className="py-24 bg-[#06261E] relative overflow-hidden border-t border-white/5">
      <Container className="relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Description Column */}
          <div className="col-span-1 lg:col-span-5 text-left flex flex-col items-start">
            <SectionTitle
              light={true}
              align="left"
              badgeText="Sneak Peek"
              title="A Premium *Application* Made for Eaters"
              subtitle="Get ready to experience dining that adapts to your taste profile, scheduled diet, and busy schedule."
              className="mb-8"
            />
            
            <div className="space-y-6 font-sans text-brand-offwhite/80 text-sm md:text-base leading-relaxed">
              <p>
                Our mobile application has been meticulously designed from the ground up to offer an elegant, fluid user experience. With micro-interactions, swipe-to-order mechanics, and a clear layout, finding your next healthy meal is effortless.
              </p>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl flex-shrink-0">
                  📱
                </div>
                <div>
                  <h4 className="font-display font-bold text-white text-sm md:text-base mb-0.5">Sleek User Interface</h4>
                  <p className="text-xs md:text-sm text-brand-offwhite/70">
                    A beautiful dark-mode luxury design that presents high-fidelity food photographs as works of art.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl flex-shrink-0">
                  ⚡
                </div>
                <div>
                  <h4 className="font-display font-bold text-white text-sm md:text-base mb-0.5">Smooth Interactions</h4>
                  <p className="text-xs md:text-sm text-brand-offwhite/70">
                    No lag, zero layout shifts, and rapid transitions. Crafted for high performance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Showcase Column (Floating Composition) */}
          <div className="col-span-1 lg:col-span-7 relative flex justify-center items-center min-h-[550px]">
            {/* Central Phone Mockup */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-[240px] h-[480px] rounded-[36px] bg-black p-3 shadow-2xl border-4 border-white/10 overflow-hidden group"
            >
              <img 
                src={appScreen} 
                alt="HomeBites App Interface" 
                className="w-full h-full object-cover rounded-[26px] select-none"
              />
              {/* Notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-5 w-24 bg-black rounded-b-xl z-20" />
            </motion.div>

            {/* Floating Branded Delivery Bag (Left side) */}
            <motion.div
              initial={{ opacity: 0, x: -50, y: 20 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              animate={{ y: [0, -12, 0] }}
              style={{ originX: 0.5, originY: 0.5 }}
              className="absolute left-[-15px] md:left-[30px] bottom-[15%] z-20 w-[180px] md:w-[220px] select-none"
            >
              <motion.img 
                src={deliveryBag} 
                alt="Branded Delivery Bag"
                animate={{ rotate: [-2, 2, -2] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="w-full object-contain pointer-events-none"
              />
            </motion.div>

            {/* Floating Gourmet Food Plate (Right side) */}
            <motion.div
              initial={{ opacity: 0, x: 50, y: -20 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              animate={{ y: [0, 15, 0] }}
              style={{ originX: 0.5, originY: 0.5 }}
              className="absolute right-[-15px] md:right-[30px] top-[10%] z-20 w-[170px] md:w-[210px] select-none"
            >
              <motion.img 
                src={foodPlate} 
                alt="Delicious Gourmet Food Plate" 
                className="w-full object-contain pointer-events-none"
              />
            </motion.div>

            {/* Floating Chef Cloche / Heart (Top-Left side) */}
            <motion.div
              initial={{ opacity: 0, y: -40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              animate={{ y: [0, -8, 0] }}
              className="absolute left-[20px] md:left-[90px] top-[5%] z-20 w-[90px] md:w-[120px] select-none"
            >
              <motion.img 
                src={cloche} 
                alt="Chef Cloche Icon"
                animate={{ rotate: [5, -5, 5] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="w-full object-contain pointer-events-none"
              />
            </motion.div>

          </div>

        </div>
      </Container>
    </section>
  );
};

export default Showcase;
