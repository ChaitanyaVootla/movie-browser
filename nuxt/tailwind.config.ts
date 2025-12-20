import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default <Partial<Config>>{
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    extend: {
      colors: {
        redd: {
            50: '#fff0f0',
            100: '#ffdddd',
            200: '#ffc1c1',
            300: '#ff9595',
            400: '#ff5858',
            500: '#ff2525',
            600: '#fd0505',
            700: '#d60000',
            800: '#b00404',
            900: '#8f0b0b',
            950: '#500000',
        },
        customwhite: {
            50: '#ffffff',
            100: '#efefef',
            200: '#dcdcdc',
            300: '#bdbdbd',
            400: '#989898',
            500: '#7c7c7c',
            600: '#656565',
            700: '#525252',
            800: '#464646',
            900: '#3d3d3d',
            950: '#292929',
        },
        customGray: {
            50: '#FFFFFF',
            100: '#F5F7F9',
            200: '#DCE2E9',
            300: '#C3CED9',
            400: '#AABAC9',
            500: '#91A6B9',
            600: '#7891A9',
            700: '#617D98',
            800: '#51697F',
            900: '#415466',
            950: '#364655',
        },
      },
    },
    fontSize: {
      '2xs': '.625rem',   // 10px
      'xs': '.75rem',     // 12px
      'sm': '.875rem',    // 14px
      'tiny': '.875rem',  // 14px
      'base': '1rem',     // 16px
      'lg': '1.125rem',   // 18px
      'xl': '1.25rem',    // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
      '5xl': '3rem',      // 48px
      '6xl': '4rem',      // 64px
      '7xl': '5rem',      // 80px
      '8xl': '6rem',      // 96px
      '9xl': '8rem',      // 128px
    }
  }
}
