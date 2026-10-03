export function scoreHalfPPR(s){
  return (Number(s.pass_yd)||0)/25+(Number(s.pass_td)||0)*4-(Number(s.pass_int)||0)*2+
    (Number(s.rush_yd)||0)/10+(Number(s.rush_td)||0)*6+
    (Number(s.rec_yd)||0)/10+(Number(s.rec_td)||0)*6+(Number(s.rec)||0)*0.5-
    (Number(s.fum_lost)||0)*2;
}