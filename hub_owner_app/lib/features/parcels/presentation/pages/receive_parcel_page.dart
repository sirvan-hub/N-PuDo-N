import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../../../app/router.dart';
import '../bloc/parcels_bloc.dart';
import '../bloc/parcels_event.dart';
import '../bloc/parcels_state.dart';

class ReceiveParcelPage extends StatefulWidget {
  const ReceiveParcelPage({super.key});
  @override State<ReceiveParcelPage> createState() => _ReceiveParcelPageState();
}
class _ReceiveParcelPageState extends State<ReceiveParcelPage> {
  final MobileScannerController _controller = MobileScannerController();
  String? _lastScanned;

  @override void dispose() { _controller.dispose(); super.dispose(); }

  void _onDetect(BarcodeCapture capture) {
    final code = capture.barcodes.first.rawValue;
    if (code == null || code == _lastScanned) return;
    _lastScanned = code;
    _controller.stop();
    context.read<HubParcelsBloc>().add(ReceiveParcelEvent(code));
  }

  @override Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('اسکن ورود بسته')),
      body: BlocConsumer<HubParcelsBloc, HubParcelsState>(
        listener: (context, state) {
          if (state is ParcelReceived) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('بسته با موفقیت دریافت شد'), backgroundColor: Colors.green));
            Navigator.of(context).pushNamedAndRemoveUntil(HubRouter.parcelsRoute, (r) => false);
          } else if (state is HubParcelsError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: Colors.red));
            setState(() => _lastScanned = null);
            _controller.start();
          }
        },
        builder: (context, state) {
          return Stack(
            children: [
              MobileScanner(controller: _controller, onDetect: _onDetect),
              Center(
                child: Container(
                  width: 250, height: 250,
                  decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
