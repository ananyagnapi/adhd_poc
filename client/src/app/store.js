import { configureStore } from '@reduxjs/toolkit'
import quetionReducer from '../slices/quetionSlice'
export const store = configureStore({
  reducer: {
    quetion:quetionReducer
  },
})