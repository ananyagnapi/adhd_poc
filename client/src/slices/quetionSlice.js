import { createSlice } from '@reduxjs/toolkit'

const initialState={
    quetionData:[]
}

export const quetionSlice=createSlice({
    name:'quetionData',
    initialState,
    reducers:{
       addAllQuetions:(state, action)=>{
            state.quetionData=action.payload
       }
    }
})
export const{addAllQuetions}=quetionSlice.actions
export default quetionSlice.reducer