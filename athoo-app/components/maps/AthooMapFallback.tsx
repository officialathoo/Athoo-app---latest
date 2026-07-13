import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

type Props = { latitude?: number; longitude?: number; draggable?: boolean; onCoordinateChange?: (latitude:number, longitude:number)=>void };

export function AthooMapFallback({ latitude = 30.3753, longitude = 69.3451, draggable = false, onCoordinateChange }: Props) {
  if (Platform.OS === "web") return <View style={styles.fallback}><Text style={styles.title}>Map preview is available in the Android and iOS app.</Text></View>;
  return (
    <MapView style={styles.map} initialRegion={{ latitude, longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }} showsUserLocation showsMyLocationButton>
      <Marker coordinate={{ latitude, longitude }} draggable={draggable} onDragEnd={(e)=>onCoordinateChange?.(e.nativeEvent.coordinate.latitude,e.nativeEvent.coordinate.longitude)} />
    </MapView>
  );
}
const styles=StyleSheet.create({map:{width:"100%",height:220,borderRadius:16},fallback:{minHeight:220,borderRadius:16,backgroundColor:"#F3F4F6",alignItems:"center",justifyContent:"center",padding:16},title:{fontSize:14,fontWeight:"700",color:"#334155",textAlign:"center"}});
