export default {
  name:"mock",
  label:"Demo data",
  async getPlayers(){
    return [];
  },
  async getActuals(_season,_week,ids){
    return Object.fromEntries(ids.map(id=>[id,0]));
  }
};