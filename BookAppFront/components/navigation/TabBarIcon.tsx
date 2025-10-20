import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export function TabBarIcon({ name, color }: { name: IoniconName; color: string }) {
  return <Ionicons name={name} color={color} size={28} style={{ marginBottom: -3 }} />;
}


