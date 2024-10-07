const webpack = require('webpack');
const path = require('path');

module.exports = {
  // Your existing webpack configuration, if any...

  resolve: {
    fallback: {
      "buffer": require.resolve("buffer/"),         // Fallback for 'buffer'
     "timers": require.resolve("timers-browserify"), // Fallback for 'timers'
    //    "timers":false
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'], // Ensures buffer is available globally
    }),
  ],
};
