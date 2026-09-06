import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../app/router.dart';
import '../../domain/entities/hub_parcel.dart';
import '../bloc/parcels_bloc.dart';
import '../bloc/parcels_event.dart';
import '../bloc/parcels_state.dart';

class MyParcelsPage extends StatefulWidget {
  const MyParcelsPage({super.key});
  @override State<MyParcelsPage> createState() => _MyParcelsPageState();
}
class _MyParcelsPageState extends State<MyParcelsPage> {
  @override void initState() { super.initState(); context.read<HubParcelsBloc>().add(LoadParcelsEvent()); }
  @override Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('بسته‌های مغازه')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).pushNamed(HubRouter.receiveRoute),
        icon: const Icon(Icons.qr_code_scanner), label: const Text('دریافت بسته'),
      ),
      body: BlocConsumer<HubParcelsBloc, HubParcelsState>(
        listener: (context, state) {
          if (state is ParcelReceived || state is ParcelDelivered) {
            context.read<HubParcelsBloc>().add(LoadParcelsEvent());
          } else if (state is HubParcelsError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message)));
          }
        },
        builder: (context, state) {
          if (state is HubParcelsLoading) return const Center(child: CircularProgressIndicator());
          if (state is HubParcelsLoaded) {
            if (state.parcels.isEmpty) return const Center(child: Text('هیچ بسته‌ای در مغازه نیست'));
            return ListView.builder(
              itemCount: state.parcels.length,
              itemBuilder: (context, i) {
                final p = state.parcels[i];
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: ListTile(
                    title: Text('کد: \${p.trackingCode}'),
                    subtitle: Text('\${p.recipientName} - \${p.recipientPhone}'),
                    trailing: p.status == ParcelStatus.received 
                        ? ElevatedButton(
                            onPressed: () => Navigator.of(context).pushNamed(HubRouter.deliverRoute, arguments: p),
                            child: const Text('تحویل'),
                          )
                        : const Icon(Icons.check_circle, color: Colors.green),
                  ),
                );
              },
            );
          }
          return const Center(child: Text('خطا در بارگذاری'));
        },
      ),
    );
  }
}
